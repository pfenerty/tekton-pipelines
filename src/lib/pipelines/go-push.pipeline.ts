import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { GitClonePipelineTask } from '../pipeline-tasks/git-clone.pipeline-task';
import { GoTestPipelineTask } from '../pipeline-tasks/go-test.pipeline-task';

export interface GoPushPipelineProps {
  namespace: string;
  name?: string;
}

/**
 * Pipeline triggered on push events: clones the repo and runs go test.
 *
 * Tasks:
 *   clone  - git-clone (Tekton catalog resolver)
 *   test   - go-test task
 *
 * Params exposed at runtime:
 *   git-url        - repository URL
 *   git-revision   - commit SHA / branch
 *   project-name   - repository name
 *   app-root       - path to Go module root (contains go.mod)
 *   build-path     - path under app-root to test
 *   golang-version - Go toolchain version (default: 1.23.0)
 *   golang-variant - base image variant (default: alpine)
 */
export class GoPushPipeline extends Construct {
  public readonly pipelineName: string;

  constructor(scope: Construct, id: string, props: GoPushPipelineProps) {
    super(scope, id);
    this.pipelineName = props.name ?? 'go-push';

    const clone = new GitClonePipelineTask();
    const test = new GoTestPipelineTask({ runAfter: clone });

    new ApiObject(this, 'resource', {
      apiVersion: 'tekton.dev/v1',
      kind: 'Pipeline',
      metadata: {
        name: this.pipelineName,
        namespace: props.namespace,
      },
      spec: {
        params: [
          { name: 'git-url', type: 'string' },
          { name: 'git-revision', type: 'string' },
          { name: 'project-name', type: 'string' },
          {
            name: 'app-root',
            description: 'path to root of the golang app (should contain go.mod, go.sum files)',
            type: 'string',
          },
          {
            name: 'build-path',
            description: 'path under app-root to target for build',
            type: 'string',
          },
          {
            name: 'golang-version',
            description: 'golang version to use for the build',
            type: 'string',
            default: '1.23.0',
          },
          {
            name: 'golang-variant',
            description: 'golang image variant to use for the build',
            type: 'string',
            default: 'alpine',
          },
        ],
        workspaces: [{ name: 'workspace' }],
        tasks: [clone, test].map(t => t.toSpec()),
      },
    });
  }
}
