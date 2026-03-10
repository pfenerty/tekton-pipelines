import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { GitClonePipelineTask } from '../tasks/git-clone.task';
import { GoTestPipelineTask } from '../tasks/go-test.task';
import {
  TEKTON_API_V1,
  WS_WORKSPACE,
  PARAM_GIT_URL,
  PARAM_GIT_REVISION,
  PARAM_PROJECT_NAME,
  PARAM_APP_ROOT,
  PARAM_BUILD_PATH,
} from '../constants';
import { GOLANG_VERSION_PARAM_SPEC, GOLANG_VARIANT_PARAM_SPEC } from '../params';

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
      apiVersion: TEKTON_API_V1,
      kind: 'Pipeline',
      metadata: {
        name: this.pipelineName,
        namespace: props.namespace,
      },
      spec: {
        params: [
          { name: PARAM_GIT_URL, type: 'string' },
          { name: PARAM_GIT_REVISION, type: 'string' },
          { name: PARAM_PROJECT_NAME, type: 'string' },
          {
            name: PARAM_APP_ROOT,
            description: 'path to root of the golang app (should contain go.mod, go.sum files)',
            type: 'string',
          },
          {
            name: PARAM_BUILD_PATH,
            description: 'path under app-root to target for build',
            type: 'string',
          },
          GOLANG_VERSION_PARAM_SPEC,
          GOLANG_VARIANT_PARAM_SPEC,
        ],
        workspaces: [{ name: WS_WORKSPACE }],
        tasks: [clone, test].map(t => t.toSpec()),
      },
    });
  }
}
