import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { PipelineTask } from '../tasks/pipeline-task';
import { PipelineParamSpec, PipelineWorkspaceDeclaration } from '../../types';
import { TEKTON_API_V1 } from '../constants';
import { Job } from './job';
import { TRIGGER_EVENTS } from './trigger-events';

export interface PipelineOptions {
  name?: string;
  triggers?: TRIGGER_EVENTS[];
  jobs: Job[];
}

function deduplicateParams(params: PipelineParamSpec[]): PipelineParamSpec[] {
  const seen = new Map<string, PipelineParamSpec>();
  for (const p of params) {
    if (!seen.has(p.name)) {
      seen.set(p.name, p);
    }
  }
  return [...seen.values()];
}

function deduplicateWorkspaces(workspaces: PipelineWorkspaceDeclaration[]): PipelineWorkspaceDeclaration[] {
  const seen = new Map<string, PipelineWorkspaceDeclaration>();
  for (const w of workspaces) {
    if (!seen.has(w.name)) {
      seen.set(w.name, w);
    }
  }
  return [...seen.values()];
}

export class Pipeline {
  readonly name: string;
  readonly triggers: TRIGGER_EVENTS[];
  readonly jobs: Job[];

  private static _counter = 0;

  constructor(opts: PipelineOptions) {
    if (opts.name) {
      this.name = opts.name;
    } else if (opts.triggers?.length === 1) {
      this.name = `${opts.triggers[0].replace('_', '-')}-pipeline`;
    } else {
      this.name = `pipeline-${Pipeline._counter++}`;
    }
    this.triggers = opts.triggers ?? [];
    this.jobs = opts.jobs;
  }

  /** Union of all pipeline-level params required by jobs. */
  inferParams(): PipelineParamSpec[] {
    const all: PipelineParamSpec[] = [];
    for (const job of this.jobs) {
      all.push(...job._internals.params);
    }
    return deduplicateParams(all);
  }

  /** Union of all pipeline-level workspaces required by jobs. */
  inferWorkspaces(): PipelineWorkspaceDeclaration[] {
    const all: PipelineWorkspaceDeclaration[] = [];
    for (const job of this.jobs) {
      all.push(...job._internals.workspaces);
    }
    return deduplicateWorkspaces(all);
  }

  /**
   * @internal Build the Tekton Pipeline ApiObject.
   * @param extraParams Additional params to include (e.g. trigger infrastructure params).
   */
  _build(
    scope: Construct,
    id: string,
    namespace: string,
    extraParams?: PipelineParamSpec[],
    namePrefix?: string,
  ): void {
    this.validate();

    const sorted = this.topoSort();
    const taskMap = new Map<Job, PipelineTask>();

    for (const job of sorted) {
      const runAfter = job.needs.map(dep => {
        const pt = taskMap.get(dep);
        if (!pt) {
          throw new Error(
            `Pipeline '${this.name}': dependency '${dep.name}' was not built before '${job.name}'`,
          );
        }
        return pt;
      });
      taskMap.set(job, job._internals.createPipelineTask(runAfter));
    }

    const jobParams = this.inferParams();
    const allParams = deduplicateParams([...(extraParams ?? []), ...jobParams]);
    const workspaces = this.inferWorkspaces();

    new ApiObject(scope, id, {
      apiVersion: TEKTON_API_V1,
      kind: 'Pipeline',
      metadata: {
        name: namePrefix ? `${namePrefix}-${this.name}` : this.name,
        namespace,
      },
      spec: {
        params: allParams,
        workspaces,
        tasks: sorted.map(job => {
          const spec = taskMap.get(job)!.toSpec();
          if (namePrefix && job._internals.createTaskResource && (spec as any).taskRef) {
            (spec as any).taskRef.name = `${namePrefix}-${(spec as any).taskRef.name}`;
          }
          return spec;
        }),
      },
    });
  }

  private validate(): void {
    const jobSet = new Set(this.jobs);
    const nameSet = new Set<string>();

    for (const job of this.jobs) {
      if (nameSet.has(job.name)) {
        throw new Error(
          `Pipeline '${this.name}': duplicate job name '${job.name}'`,
        );
      }
      nameSet.add(job.name);

      for (const dep of job.needs) {
        if (!jobSet.has(dep)) {
          throw new Error(
            `Pipeline '${this.name}': job '${job.name}' depends on '${dep.name}' which is not in the pipeline's jobs array`,
          );
        }
      }
    }
  }

  private topoSort(): Job[] {
    const visited = new Set<Job>();
    const visiting = new Set<Job>();
    const result: Job[] = [];

    const visit = (job: Job): void => {
      if (visited.has(job)) return;
      if (visiting.has(job)) {
        throw new Error(
          `Pipeline '${this.name}': cycle detected involving job '${job.name}'`,
        );
      }
      visiting.add(job);
      for (const dep of job.needs) {
        visit(dep);
      }
      visiting.delete(job);
      visited.add(job);
      result.push(job);
    };

    for (const job of this.jobs) visit(job);
    return result;
  }
}
