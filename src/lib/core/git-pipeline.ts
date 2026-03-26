import { Param } from './param';
import { Workspace } from './workspace';
import { Task } from './task';
import { Pipeline, PipelineOptions } from './pipeline';

/** Options for constructing a {@link GitPipeline}. */
export interface GitPipelineOptions extends PipelineOptions {
  /**
   * Shared workspace mounted by all tasks. Auto-created when omitted.
   * Defaults to `new Workspace({ name: "workspace" })`.
   */
  workspace?: Workspace;
  /**
   * Container image used for the git clone step.
   * Defaults to `cgr.dev/chainguard/git:latest`.
   */
  cloneImage?: string;
}

/**
 * A Pipeline that automatically clones a git repository before running tasks.
 *
 * `GitPipeline` creates a `git-clone` task and a shared workspace, then wires
 * both into every task in the pipeline:
 * - The workspace is added to each task's `workspaces` (if not already present).
 * - Tasks with no `runAfter` dependencies get `git-clone` injected automatically
 *   at pipeline-spec time — `task.needs` is never mutated, so task instances can
 *   be safely shared between multiple pipelines.
 *
 * @example
 * ```ts
 * const workspace = new Workspace({ name: "workspace" });
 * const testTask = new Task({ name: "test", steps: [...] });
 * const buildTask = new Task({ name: "build", needs: [testTask], steps: [...] });
 *
 * const pipeline = new GitPipeline({
 *   workspace,
 *   triggers: [TRIGGER_EVENTS.PUSH],
 *   tasks: [testTask, buildTask],
 * });
 * // Execution order: git-clone → test → build
 * // pipeline.workspace — the shared workspace
 * // pipeline.cloneTask — the auto-generated git-clone task
 * ```
 */
export class GitPipeline extends Pipeline {
  /** The shared workspace mounted by all tasks. */
  readonly workspace: Workspace;
  /** The auto-generated git-clone task. */
  readonly cloneTask: Task;

  constructor(opts: GitPipelineOptions) {
    const workspace = opts.workspace ?? new Workspace({ name: 'workspace' });
    const url = new Param({ name: 'url' });
    const revision = new Param({ name: 'revision' });

    const cloneTask = new Task({
      name: 'git-clone',
      params: [url, revision],
      workspaces: [workspace],
      steps: [{
        name: 'clone',
        image: opts.cloneImage ?? 'cgr.dev/chainguard/git:latest',
        script: `#!/bin/sh
set -e
git clone ${url} .
git config --global --add safe.directory ${workspace.path}
git checkout ${revision}`,
      }],
    });

    // Discover all user tasks transitively and inject the shared workspace.
    // This mutation is idempotent: a workspace with the same name is never added twice,
    // making it safe when the same task instance appears in multiple GitPipelines.
    const allUserTasks = GitPipeline._discoverUserTasks(opts.tasks);
    for (const task of allUserTasks) {
      if (!task.workspaces.some(w => w.name === workspace.name)) {
        (task.workspaces as Workspace[]).push(workspace);
      }
    }

    // Pass cloneTask as the first task so Pipeline.discoverAllTasks includes it
    // in allTasks and synthesizes it into the pipeline spec.
    super({ ...opts, tasks: [cloneTask, ...opts.tasks] });

    this.workspace = workspace;
    this.cloneTask = cloneTask;
  }

  /**
   * Injects `git-clone` as a `runAfter` dependency for tasks that have no other
   * ordering constraints (i.e. root tasks). This runs at pipeline-spec time and
   * does not mutate any task's `needs` array.
   */
  protected override runAfterFor(task: Task): string[] {
    const names = super.runAfterFor(task);
    if (names.length === 0 && task !== this.cloneTask) {
      return [this.cloneTask.name];
    }
    return names;
  }

  private static _discoverUserTasks(tasks: Task[]): Task[] {
    const seen = new Set<Task>();
    const visit = (t: Task): void => {
      if (seen.has(t)) return;
      seen.add(t);
      for (const dep of t.needs) visit(dep);
    };
    for (const t of tasks) visit(t);
    return [...seen];
  }
}
