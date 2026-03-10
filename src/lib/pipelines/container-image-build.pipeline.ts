import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { FixFilePermsPipelineTask } from '../pipeline-tasks/fix-file-perms.pipeline-task';
import { GitClonePipelineTask } from '../pipeline-tasks/git-clone.pipeline-task';
import { KoBuildPipelineTask } from '../pipeline-tasks/ko-build.pipeline-task';

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
    const clone = new GitClonePipelineTask({ workspace: 'git-source', runAfter: fixPerms });
    const build = new KoBuildPipelineTask({ runAfter: clone });

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
          { name: 'image-name', type: 'string' },
        ],
        workspaces: [
          { name: 'git-source' },
          { name: 'dockerconfig' },
        ],
        tasks: [fixPerms, clone, build].map(t => t.toSpec()),
      },
    });
  }
}
