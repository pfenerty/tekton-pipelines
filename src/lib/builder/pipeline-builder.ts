import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { PipelineTask } from '../tasks/pipeline-task';
import { TEKTON_API_V1 } from '../constants';
import { PipelineParamSpec, PipelineWorkspaceDeclaration } from '../../types';

// Re-export shared types for backward compatibility
export type { PipelineParamSpec, PipelineWorkspaceDeclaration } from '../../types';

/**
 * A factory function that receives the already-constructed runAfter PipelineTask
 * instances for each declared dependency, then returns a new PipelineTask.
 *
 * Construction is deferred until PipelineBuilder.build() is called, which allows
 * the builder to manage the dependency graph without mutating tasks after creation.
 */
export type TaskFactory<T extends PipelineTask> = (runAfter: PipelineTask[]) => T;

interface TaskNode {
  key: string;
  factory: TaskFactory<PipelineTask>;
  dependsOn: string[];
}

export interface PipelineBuildOptions {
  /** The Tekton Pipeline resource name (metadata.name). */
  name: string;
  /** Kubernetes namespace the Pipeline will be deployed to. */
  namespace: string;
  /** Pipeline-level param specs. */
  params?: PipelineParamSpec[];
  /** Pipeline-level workspace declarations. */
  workspaces?: PipelineWorkspaceDeclaration[];
}

/**
 * Fluent builder for composing Tekton Pipelines from PipelineTask constructs.
 *
 * Users register tasks with explicit dependency keys. The builder performs a
 * topological sort, then constructs each task in dependency order — passing
 * already-constructed upstream tasks as the runAfter array. This deferred
 * construction pattern means PipelineTask instances never need to be mutated
 * after creation.
 *
 * @example
 * ```typescript
 * new PipelineBuilder()
 *   .addFirst('clone', () => new GitClonePipelineTask())
 *   .addTask('test', ([clone]) => new GoTestPipelineTask({ runAfter: clone }), ['clone'])
 *   .addTask('sbom', ([clone]) => new GenerateSbomPipelineTask({ runAfter: clone }), ['clone'])
 *   .addTask('vuln', ([sbom]) => new VulnScanPipelineTask({ runAfter: sbom }), ['sbom'])
 *   .build(scope, 'pipeline', {
 *     name: 'my-pipeline',
 *     namespace: 'tekton-builds',
 *     params: [...],
 *     workspaces: [{ name: 'workspace' }],
 *   });
 * ```
 */
export class PipelineBuilder {
  private readonly nodes = new Map<string, TaskNode>();
  private readonly insertionOrder: string[] = [];

  /**
   * Register a task with the builder.
   *
   * @param key       Unique identifier for this task within the builder.
   * @param factory   Called during build() with the resolved runAfter PipelineTask
   *                  instances (in the same order as dependsOn). Returns the task.
   * @param dependsOn Keys of tasks that must complete before this one (runAfter).
   *                  Tasks with overlapping dependsOn keys run in parallel.
   */
  addTask<T extends PipelineTask>(
    key: string,
    factory: TaskFactory<T>,
    dependsOn: string[] = [],
  ): this {
    if (this.nodes.has(key)) {
      throw new Error(`PipelineBuilder: duplicate task key '${key}'`);
    }
    this.nodes.set(key, { key, factory, dependsOn });
    this.insertionOrder.push(key);
    return this;
  }

  /**
   * Convenience method: register a task with no dependencies (runs first).
   * Equivalent to addTask(key, factory, []).
   */
  addFirst<T extends PipelineTask>(key: string, factory: TaskFactory<T>): this {
    return this.addTask(key, factory, []);
  }

  /**
   * Convenience method: register a task that depends on ALL previously registered
   * tasks. Useful for simple linear pipelines where each step follows the last.
   * Equivalent to addTask(key, factory, [<all prior keys>]).
   */
  addAfterAll<T extends PipelineTask>(key: string, factory: TaskFactory<T>): this {
    return this.addTask(key, factory, [...this.insertionOrder]);
  }

  /**
   * Synthesise a Tekton Pipeline ApiObject into the given CDK8s scope.
   *
   * Performs topological sort on the registered tasks, constructs each in
   * dependency order, then emits the Pipeline resource.
   *
   * @throws Error if a cycle is detected or a dependsOn key references an
   *         unknown task.
   */
  build(scope: Construct, id: string, opts: PipelineBuildOptions): void {
    const sorted = this.topoSort();
    const built = new Map<string, PipelineTask>();

    for (const key of sorted) {
      const node = this.nodes.get(key)!;
      const runAfterTasks = node.dependsOn.map(dep => {
        const t = built.get(dep);
        if (!t) {
          throw new Error(
            `PipelineBuilder: dependency '${dep}' was not built before '${key}'`,
          );
        }
        return t;
      });
      built.set(key, node.factory(runAfterTasks));
    }

    new ApiObject(scope, id, {
      apiVersion: TEKTON_API_V1,
      kind: 'Pipeline',
      metadata: {
        name: opts.name,
        namespace: opts.namespace,
      },
      spec: {
        params: opts.params ?? [],
        workspaces: opts.workspaces ?? [],
        tasks: sorted.map(k => built.get(k)!.toSpec()),
      },
    });
  }

  private topoSort(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (key: string): void => {
      if (visited.has(key)) return;
      if (visiting.has(key)) {
        throw new Error(`PipelineBuilder: cycle detected involving task '${key}'`);
      }
      visiting.add(key);
      const node = this.nodes.get(key);
      if (!node) {
        throw new Error(`PipelineBuilder: unknown task key '${key}'`);
      }
      for (const dep of node.dependsOn) visit(dep);
      visiting.delete(key);
      visited.add(key);
      result.push(key);
    };

    for (const key of this.insertionOrder) visit(key);
    return result;
  }
}
