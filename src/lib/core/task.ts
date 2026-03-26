import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { TEKTON_API_V1, DEFAULT_STEP_SECURITY_CONTEXT, DEFAULT_STEP_RESOURCES } from '../constants';
import { Param } from './param';
import { Workspace } from './workspace';
import type { StatusReporter } from './status-reporter';

/** Specification for a single step within a Tekton Task. */
export interface TaskStepSpec {
  /** Step name (must be unique within the task). */
  name: string;
  /** Container image to run for this step. */
  image: string;
  /** Entrypoint command override. */
  command?: string[];
  /** Arguments passed to the entrypoint. */
  args?: string[];
  /** Inline script executed by the step. */
  script?: string;
  /** Working directory for the step. */
  workingDir?: string;
  /** Environment variables injected into the step container. */
  env?: {
    name: string;
    value?: string;
    valueFrom?: { secretKeyRef: { name: string; key: string } };
  }[];
  /** Controls behaviour when this step fails. `continue` lets subsequent steps run. */
  onError?: 'continue' | 'stopAndFail';
  /** CPU/memory requests and limits for this step (overrides stepTemplate computeResources). */
  computeResources?: {
    requests?: { cpu?: string; memory?: string };
    limits?: { cpu?: string; memory?: string };
  };
}

/** Options for constructing a {@link Task}. */
export interface TaskOptions {
  /** Task name used in Tekton manifests and pipeline task references. */
  name: string;
  /** Parameters accepted by this task. */
  params?: Param[];
  /** Workspaces required by this task. */
  workspaces?: Workspace[];
  /** Ordered list of steps the task executes. */
  steps: TaskStepSpec[];
  /** Tasks that must complete before this task runs (dependency graph edges). */
  needs?: Task[];
  /** Override or extend the default step template (merged with security context defaults). */
  stepTemplate?: Record<string, unknown>;
  /**
   * Status context string reported to the external system (e.g. `"ci/test"`).
   * When set together with `statusReporter`, the reporter's `finalStep` is
   * automatically appended to this task's steps at synthesis time.
   */
  statusContext?: string;
  /** Reporter used to generate the final-status step for this task. */
  statusReporter?: StatusReporter;
}

/**
 * A Tekton Task definition.
 *
 * Tasks are the unit of work in a Tekton pipeline. Each task declares its
 * params, workspaces, and steps. The {@link needs} array defines the dependency
 * graph — pipelines automatically discover transitive dependencies and set
 * `runAfter` ordering.
 *
 * All steps inherit a secure-by-default `stepTemplate` that drops all
 * capabilities and enables seccomp. Override via the `stepTemplate` option.
 */
export class Task {
  readonly name: string;
  readonly params: Param[];
  readonly workspaces: Workspace[];
  readonly steps: TaskStepSpec[];
  /** Tasks that must complete before this task runs. */
  readonly needs: Task[];
  readonly stepTemplate?: Record<string, unknown>;
  /** Status context reported to the external system. */
  readonly statusContext?: string;
  /** Reporter that generates the final-status step. */
  readonly statusReporter?: StatusReporter;

  constructor(opts: TaskOptions) {
    this.name = opts.name;
    this.params = opts.params ?? [];
    this.workspaces = opts.workspaces ?? [];
    this.steps = opts.steps;
    this.needs = opts.needs ?? [];
    this.stepTemplate = opts.stepTemplate;
    this.statusContext = opts.statusContext;
    this.statusReporter = opts.statusReporter;
  }

  /** Synthesizes the Tekton Task resource into the given cdk8s scope. */
  synth(scope: Construct, namespace: string, namePrefix?: string): void {
    const resourceName = namePrefix ? `${namePrefix}-${this.name}` : this.name;
    const steps = (this.statusReporter && this.statusContext)
      ? [...this.steps, this.statusReporter.finalStep(this.statusContext)]
      : this.steps;
    new ApiObject(scope, this.name, {
      apiVersion: TEKTON_API_V1,
      kind: 'Task',
      metadata: { name: resourceName, namespace },
      spec: {
        stepTemplate: {
          securityContext: DEFAULT_STEP_SECURITY_CONTEXT,
          computeResources: DEFAULT_STEP_RESOURCES,
          ...(this.stepTemplate ?? {}),
        },
        ...(this.params.length > 0 && { params: this.params.map(p => p.toSpec()) }),
        ...(this.workspaces.length > 0 && { workspaces: this.workspaces.map(w => w.toSpec()) }),
        steps,
      },
    });
  }

  /** @internal Generates the pipeline task spec used inside a Pipeline resource. */
  _toPipelineTaskSpec(runAfterNames: string[], namePrefix?: string): Record<string, unknown> {
    const taskRefName = namePrefix ? `${namePrefix}-${this.name}` : this.name;
    const spec: Record<string, unknown> = {
      name: this.name,
      taskRef: { kind: 'Task', name: taskRefName },
    };
    if (this.params.length > 0) {
      spec.params = this.params.map(p => ({
        name: p.name,
        value: p.pipelineExpression ?? `$(params.${p.name})`,
      }));
    }
    if (this.workspaces.length > 0) {
      spec.workspaces = this.workspaces.map(w => ({ name: w.name, workspace: w.name }));
    }
    if (runAfterNames.length > 0) {
      spec.runAfter = runAfterNames;
    }
    return spec;
  }
}
