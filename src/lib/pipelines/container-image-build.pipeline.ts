import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { FixFilePermsPipelineTask } from '../tasks/fix-file-perms.task';
import { GitClonePipelineTask } from '../tasks/git-clone.task';
import { KoBuildPipelineTask } from '../tasks/ko-build.task';
import {
  TEKTON_API_V1,
  WS_GIT_SOURCE,
  WS_DOCKERCONFIG,
  PARAM_GIT_URL,
  PARAM_GIT_REVISION,
  PARAM_IMAGE_NAME,
} from '../constants';

export interface ContainerImageBuildPipelineProps {
  namespace: string;
  name?: string;
}

/**
 * Pipeline that builds a container image using Ko.
 *
 * References external Tasks not managed in this repo:
 *   fix-file-perms - ensures workspace has correct permissions
 *   ko-build       - builds and pushes an OCI image using Ko
 *
 * Tasks:
 *   fix-file-perms - (external) fix workspace permissions
 *   clone          - git-clone (Tekton catalog resolver)
 *   build          - ko-build (external)
 *
 * Params exposed at runtime:
 *   git-url      - repository URL
 *   git-revision - commit SHA / branch
 *   image-name   - fully-qualified image name (registry/repo:tag)
 */
export class ContainerImageBuildPipeline extends Construct {
  public readonly pipelineName: string;

  constructor(scope: Construct, id: string, props: ContainerImageBuildPipelineProps) {
    super(scope, id);
    this.pipelineName = props.name ?? 'container-image-build';

    const fixPerms = new FixFilePermsPipelineTask();
    const clone = new GitClonePipelineTask({ workspace: WS_GIT_SOURCE, runAfter: fixPerms });
    const build = new KoBuildPipelineTask({ runAfter: clone });

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
          { name: PARAM_IMAGE_NAME, type: 'string' },
        ],
        workspaces: [
          { name: WS_GIT_SOURCE },
          { name: WS_DOCKERCONFIG },
        ],
        tasks: [fixPerms, clone, build].map(t => t.toSpec()),
      },
    });
  }
}
