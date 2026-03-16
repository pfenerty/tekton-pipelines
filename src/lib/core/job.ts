import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { PipelineTask } from '../tasks/pipeline-task';
import { PipelineParamSpec, PipelineWorkspaceDeclaration } from '../../types';
import {
  TEKTON_API_V1,
  WS_WORKSPACE,
  DEFAULT_STEP_SECURITY_CONTEXT,
} from '../constants';
import { WORKSPACE_BINDING } from '../workspaces';

export interface JobOptions {
  name?: string;
  image: string;
  script: string;
  needs?: Job | Job[];
}

/** @internal */
export interface JobInternals {
  taskResourceName: string;
  params: PipelineParamSpec[];
  workspaces: PipelineWorkspaceDeclaration[];
  createTaskResource: ((scope: Construct, id: string, namespace: string) => void) | null;
  createPipelineTask: (runAfter: PipelineTask[]) => PipelineTask;
}

/** @internal */
class CustomPipelineTask extends PipelineTask {
  readonly name: string;
  private readonly taskResourceName: string;

  constructor(name: string, taskResourceName: string, runAfter: PipelineTask[]) {
    super(runAfter);
    this.name = name;
    this.taskResourceName = taskResourceName;
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: this.taskResourceName },
      workspaces: [WORKSPACE_BINDING],
    });
  }
}

function normalizeNeeds(needs?: Job | Job[]): Job[] {
  if (!needs) return [];
  return Array.isArray(needs) ? needs : [needs];
}

export class Job {
  readonly name: string;
  readonly needs: Job[];
  /** @internal */
  readonly _internals: JobInternals;

  private static _counter = 0;

  constructor(opts: JobOptions) {
    this.name = opts.name ?? `job-${Job._counter++}`;
    this.needs = normalizeNeeds(opts.needs);
    const taskResourceName = this.name;

    this._internals = {
      taskResourceName,
      params: [],
      workspaces: [{ name: WS_WORKSPACE }],
      createTaskResource: (scope, id, namespace) => {
        new ApiObject(scope, id, {
          apiVersion: TEKTON_API_V1,
          kind: 'Task',
          metadata: { name: taskResourceName, namespace },
          spec: {
            stepTemplate: { securityContext: DEFAULT_STEP_SECURITY_CONTEXT },
            steps: [
              {
                name: 'run',
                image: opts.image,
                script: opts.script,
                workingDir: `$(workspaces.${WS_WORKSPACE}.path)`,
              },
            ],
            workspaces: [{ name: WS_WORKSPACE }],
          },
        });
      },
      createPipelineTask: (runAfter) =>
        new CustomPipelineTask(this.name, taskResourceName, runAfter),
    };
  }

  /** @internal */
  static _prebuilt(
    name: string,
    needs: Job | Job[] | undefined,
    internals: JobInternals,
  ): Job {
    const job = Object.create(Job.prototype) as Job;
    (job as any).name = name;
    (job as any).needs = normalizeNeeds(needs);
    (job as any)._internals = internals;
    return job;
  }
}
