import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { TEKTON_API_V1 } from '../constants';
import { Param } from './param';
import { Workspace } from './workspace';
import { Task, TaskLike, TaskDef } from './task';
import { TRIGGER_EVENTS } from './trigger-events';
import { triggerEvents } from './pac-trigger';
import type { PipelineTrigger } from './pac-trigger';
import { Condition } from './condition';
import { applyOverrides, unwrapGated, GatedTask } from './pipeline-task';
import type { PipelineTaskOverrides } from './pipeline-task';

/**
 * The workspace name a `$(workspaces.<name>.path)`-rooted working directory refers to,
 * or `undefined` when the directory is absent or not workspace-relative.
 */
function workspaceOfPath(workingDir: unknown): string | undefined {
  if (typeof workingDir !== 'string') return undefined;
  return /^\$\(workspaces\.([^.)]+)\.path\)/.exec(workingDir)?.[1];
}

/** Options for constructing a {@link Pipeline}. */
export interface PipelineOptions {
  /**
   * Pipeline name. Auto-generated from the trigger event when omitted
   * (e.g. `"push-pipeline"` for a single-event trigger).
   */
  name?: string;
  /**
   * Firing config — when this pipeline runs (events, branches, paths, comment/label filters).
   * See {@link PipelineTrigger}. A pipeline without a `trigger` is not emitted.
   */
  trigger?: PipelineTrigger;
  /** Top-level tasks. Transitive dependencies are auto-discovered via `task.needs`. */
  tasks: TaskLike[];
  /** Tasks that run unconditionally after all regular tasks complete or fail. */
  finallyTasks?: TaskLike[];
  /** Additional pipeline-level params not tied to any specific task. */
  params?: Param[];
  /**
   * Overall PipelineRun timeout as a Go duration string (e.g. `"2h"`, `"90m"`).
   * Emitted by {@link TektonicProject} as `spec.timeouts.pipeline`. When unset, Tekton's
   * default (1h) applies — raise it for long pipelines (e.g. many image builds).
   */
  timeout?: string;
}

/**
 * A Tekton Pipeline definition.
 *
 * Automatically discovers all transitive task dependencies, infers the union of
 * params and workspaces from all tasks, validates the dependency graph, and
 * topologically sorts tasks for execution.
 */
export class Pipeline {
  readonly name: string;
  /** Firing config (events, branches, paths, …), emitted as PAC annotations by TektonicProject. */
  readonly trigger?: PipelineTrigger;
  /** Trigger events associated with this pipeline (union of `trigger.rules[].on`). */
  readonly events: TRIGGER_EVENTS[];
  /** Top-level tasks provided at construction. */
  readonly tasks: TaskLike[];
  /** All tasks including transitive dependencies discovered via `task.needs`. */
  readonly allTasks: TaskLike[];
  /** Tasks that run unconditionally after all regular tasks complete or fail. */
  readonly finallyTasks: TaskLike[];
  /** Overall PipelineRun timeout (Go duration), emitted by TektonicProject. Unset = Tekton default. */
  readonly timeout?: string;
  private readonly extraParams: Param[];
  /**
   * Per-edge overrides contributed by `gated()` markers, keyed by the *unwrapped* task.
   * Markers are unwrapped before discovery so identity dedupes to one graph node; the
   * overrides they carried are applied here at spec-build time instead.
   */
  private readonly taskOverrides = new Map<TaskLike, PipelineTaskOverrides>();
  /**
   * Producing tasks of a `gated()` override's {@link Condition}, keyed by the gated task.
   * `TaskDef` wires the sources of its own `when` into `needs`; a `gated()` override cannot
   * do that without mutating a task shared between pipelines, so the pipeline carries the
   * edge instead — the sources are discovered and become `runAfter` entries.
   */
  private readonly overrideSources = new Map<TaskLike, TaskLike[]>();
  /** @internal Auto-generated task that sets all status contexts to pending at pipeline start. */
  protected readonly _pendingTask?: TaskDef;

  private static _counter = 0;

  constructor(opts: PipelineOptions) {
    this.trigger = opts.trigger;
    this.events = opts.trigger ? triggerEvents(opts.trigger) : [];
    if (opts.name) {
      this.name = opts.name;
    } else if (this.events.length === 1) {
      this.name = `${this.events[0].replace('_', '-')}-pipeline`;
    } else {
      this.name = `pipeline-${Pipeline._counter++}`;
    }
    this.tasks = opts.tasks.map(t => this.registerOverrides(t));
    this.finallyTasks = (opts.finallyTasks ?? []).map(t => this.registerOverrides(t));
    this.timeout = opts.timeout;
    this.extraParams = opts.params ?? [];

    const regularTasks = this.discoverAllTasks(this.tasks);
    const statusTasks = regularTasks.filter(
      (t): t is TaskDef => t instanceof TaskDef && !!t.statusContext && !!t.statusReporter,
    );

    if (statusTasks.length > 0) {
      const reporter = statusTasks[0].statusReporter!;
      const contexts = statusTasks.map(t => t.statusContext!);
      this._pendingTask = reporter.createPendingTask(contexts, `set-status-pending-${this.name}`);
      this.allTasks = [this._pendingTask, ...regularTasks];

      // A reporting task's own report-status step is its last step, so anything that stops
      // the task from reaching it leaves the context stuck on "pending" from the task above:
      // a `when` that skips the task, but equally an OOMKill, node eviction, image-pull
      // failure or TaskRun timeout, none of which are gated and none of which run any step.
      // Reconcile every reporting task in a `finally` task that runs after the whole DAG.
      const reconcile = (reporter.createStatusReconcilerTask ?? reporter.createSkipResolverTask)?.bind(reporter);
      if (reconcile) {
        const entries = statusTasks.map(t => ({ taskName: t.name, context: t.statusContext! }));
        (this.finallyTasks as TaskLike[]).push(reconcile(entries, `reconcile-status-${this.name}`));
      }
    } else {
      this.allTasks = regularTasks;
    }

    this.flagSharedWorkspaceCaches(regularTasks);

    // Collect cache-save finally tasks from TaskDef nodes only.
    const cacheFinallyTasks = regularTasks
      .filter((t): t is TaskDef => t instanceof TaskDef)
      .flatMap(t => t.getCacheFinallyTasks());
    if (cacheFinallyTasks.length > 0) {
      (this.finallyTasks as TaskLike[]).push(...cacheFinallyTasks);
    }
  }

  /**
   * Flags caches whose restore would write into a workspace that more than one task in this
   * pipeline mounts. Tekton runs independent tasks concurrently, so a restore there lands on
   * a tree another task is actively using — the case that used to be a `rm -rf` of live files
   * and is now an atomic swap, but a swap that still discards work the other task just did.
   * Such caches default to `skipRestoreIfPathsExist`; an explicit setting always wins.
   */
  private flagSharedWorkspaceCaches(tasks: TaskLike[]): void {
    const mountCount = new Map<string, number>();
    for (const t of tasks) {
      for (const w of new Set(t.workspaces.map(w => w.name))) {
        mountCount.set(w, (mountCount.get(w) ?? 0) + 1);
      }
    }
    for (const task of tasks) {
      if (!(task instanceof TaskDef)) continue;
      for (const cache of task.caches) {
        if (cache.skipRestoreIfPathsExist !== undefined) continue;
        const target = workspaceOfPath(cache.workingDir ?? task.stepTemplate?.workingDir);
        if (!target || (mountCount.get(target) ?? 0) < 2) continue;
        task._markSharedWorkspaceCache(cache.name);
        // eslint-disable-next-line no-console
        console.warn(
          `tektonic [${this.name}/${task.name}]: cache '${cache.name}' restores into workspace ` +
            `'${target}', which ${mountCount.get(target)} tasks in this pipeline mount — ` +
            `defaulting to skipRestoreIfPathsExist so a concurrent task's warm tree is kept. ` +
            `Set skipRestoreIfPathsExist explicitly to silence this.`,
        );
      }
    }
  }

  protected discoverAllTasks(tasks: TaskLike[]): TaskLike[] {
    const seen = new Set<TaskLike>();
    const visit = (node: TaskLike) => {
      const t = this.registerOverrides(node);
      if (seen.has(t)) return;
      seen.add(t);
      for (const dep of this.dependenciesOf(t)) visit(dep);
    };
    for (const t of tasks) visit(t);
    return [...seen];
  }

  /**
   * Records a `gated()` marker's overrides against the task it wraps and returns that task,
   * so the graph only ever holds unwrapped tasks and identity comparisons hold. Non-markers
   * pass through unchanged. Gating the same task twice in one pipeline is ambiguous, so it
   * throws rather than silently picking one set of overrides.
   */
  private registerOverrides(node: TaskLike): TaskLike {
    if (!(node instanceof GatedTask)) return node;
    const task = node.task;
    const existing = this.taskOverrides.get(task);
    if (existing && existing !== node._overrides) {
      throw new Error(
        `Pipeline '${this.name}': task '${task.name}' is gated more than once with different overrides`,
      );
    }
    this.taskOverrides.set(task, node._overrides);
    if (node._overrides.when instanceof Condition) {
      this.overrideSources.set(task, node._overrides.when.sources().map(unwrapGated));
    }
    return task;
  }

  /**
   * Graph edges into `task`: its own `needs` plus the producing tasks of any `gated()`
   * override condition, which the task itself does not know about.
   */
  private dependenciesOf(task: TaskLike): TaskLike[] {
    const needs = task.needs.map(unwrapGated);
    const sources = this.overrideSources.get(task) ?? [];
    return [...needs, ...sources.filter(s => !needs.includes(s))];
  }

  /**
   * The `when` that will actually gate `task` in this pipeline: a `gated()` wrapper's override
   * replaces the task's own `when` for that pipeline edge, so it takes precedence when present.
   * Exposed for subclasses that need the effective gate without reaching into the overlay.
   */
  protected effectiveWhen(task: TaskDef): TaskDef['when'] {
    const overrides = this.taskOverrides.get(task);
    return overrides?.when !== undefined ? overrides.when : task.when;
  }

  /** @internal Emits one pipeline task entry, applying any `gated()` overrides for that task. */
  private toPipelineTaskSpec(task: TaskLike, runAfter: string[], namePrefix?: string): Record<string, unknown> {
    const spec = task._toPipelineTaskSpec(runAfter, namePrefix);
    const overrides = this.taskOverrides.get(task);
    return overrides ? applyOverrides(spec, overrides) : spec;
  }

  /** Returns the de-duplicated union of all task params plus any extra pipeline-level params. */
  inferParams(): Record<string, unknown>[] {
    const seen = new Map<string, Param>();
    for (const task of [...this.allTasks, ...this.finallyTasks]) {
      // A fan-out param is supplied per-element by the task's matrix, not by a
      // pipeline-level param, so exclude it from inference.
      const matrixParam = task instanceof TaskDef && task.fanOut ? task.fanOut.as.name : undefined;
      for (const p of task.params) {
        if (p.name === matrixParam) continue;
        if (!seen.has(p.name) && !p.pipelineExpression) seen.set(p.name, p);
      }
    }
    for (const p of this.extraParams) {
      if (!seen.has(p.name)) seen.set(p.name, p);
    }
    return [...seen.values()].map(p => p.toSpec());
  }

  /** Returns the de-duplicated union of all task workspaces. */
  inferWorkspaces(): Record<string, unknown>[] {
    const seen = new Map<string, Workspace>();
    for (const task of [...this.allTasks, ...this.finallyTasks]) {
      for (const w of task.workspaces) {
        if (!seen.has(w.name)) seen.set(w.name, w);
      }
    }
    return [...seen.values()].map(w => w.toSpec());
  }

  /**
   * @internal Returns the Pipeline spec as a plain object.
   * Used by {@link TektonicProject} to inline the spec into a PAC PipelineRun template.
   */
  _buildSpec(
    extraParams?: Record<string, unknown>[],
    namePrefix?: string,
  ): Record<string, unknown> {
    this.validate();
    const sorted = this.topoSort();
    return {
      params: this.deduplicateParams([...(extraParams ?? []), ...this.inferParams()]),
      workspaces: this.inferWorkspaces(),
      tasks: sorted.map(task =>
        this.toPipelineTaskSpec(task, this.runAfterFor(task), namePrefix),
      ),
      ...(this.finallyTasks.length > 0 && {
        finally: this.finallyTasks.map(task =>
          this.toPipelineTaskSpec(task, [], namePrefix),
        ),
      }),
    };
  }

  /**
   * @internal Synthesizes a standalone `kind: Pipeline` resource. Not used by the PAC
   * synthesizer (which inlines the spec via {@link Pipeline._buildSpec}); retained for
   * tests and custom synthesis.
   */
  _build(
    scope: Construct,
    id: string,
    namespace: string,
    extraParams?: Record<string, unknown>[],
    namePrefix?: string,
  ): void {
    new ApiObject(scope, id, {
      apiVersion: TEKTON_API_V1,
      kind: 'Pipeline',
      metadata: {
        name: namePrefix ? `${namePrefix}-${this.name}` : this.name,
        namespace,
      },
      spec: this._buildSpec(extraParams, namePrefix),
    });
  }

  /**
   * Returns the `runAfter` task names for a given task within this pipeline.
   * Override in subclasses to inject additional ordering constraints.
   */
  protected runAfterFor(task: TaskLike): string[] {
    let names = this.dependenciesOf(task)
      .filter(dep => this.allTasks.includes(dep))
      .map(dep => dep.name);
    if (this._pendingTask && task instanceof TaskDef && task.statusContext && task.statusReporter && task !== this._pendingTask) {
      names = [...names, this._pendingTask.name];
    }
    return names;
  }

  private deduplicateParams(params: Record<string, unknown>[]): Record<string, unknown>[] {
    const seen = new Set<string>();
    return params.filter(p => {
      const name = p.name as string;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  }

  private validate(): void {
    const taskSet = new Set(this.allTasks);
    const nameSet = new Set<string>();

    for (const task of this.allTasks) {
      if (nameSet.has(task.name)) {
        throw new Error(
          `Pipeline '${this.name}': duplicate task name '${task.name}'`,
        );
      }
      nameSet.add(task.name);

      for (const dep of this.dependenciesOf(task)) {
        if (!taskSet.has(dep)) {
          throw new Error(
            `Pipeline '${this.name}': task '${task.name}' depends on '${dep.name}' which is not in the pipeline`,
          );
        }
      }
    }
  }

  private topoSort(): TaskLike[] {
    const visited = new Set<TaskLike>();
    const visiting = new Set<TaskLike>();
    const result: TaskLike[] = [];

    const visit = (task: TaskLike): void => {
      if (visited.has(task)) return;
      if (visiting.has(task)) {
        throw new Error(
          `Pipeline '${this.name}': cycle detected involving task '${task.name}'`,
        );
      }
      visiting.add(task);
      for (const dep of this.dependenciesOf(task)) {
        visit(dep);
      }
      visiting.delete(task);
      visited.add(task);
      result.push(task);
    };

    for (const task of this.allTasks) visit(task);
    return result;
  }
}
