import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';

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
        tasks: [
          {
            name: 'fix-file-perms',
            taskRef: { kind: 'Task', name: 'fix-file-perms' },
            workspaces: [{ name: 'source', workspace: 'git-source' }],
          },
          {
            name: 'clone',
            runAfter: ['fix-file-perms'],
            taskRef: {
              resolver: 'git',
              params: [
                { name: 'url', value: 'https://github.com/tektoncd/catalog.git' },
                { name: 'pathInRepo', value: '/task/git-clone/0.9/git-clone.yaml' },
                { name: 'revision', value: 'main' },
              ],
            },
            params: [
              { name: 'url', value: '$(params.git-url)' },
              { name: 'revision', value: '$(params.git-revision)' },
            ],
            workspaces: [{ name: 'output', workspace: 'git-source' }],
          },
          {
            name: 'build',
            runAfter: ['clone'],
            taskRef: { kind: 'Task', name: 'ko-build' },
            params: [
              { name: 'docker-repo', value: '$(params.image-name)' },
              { name: 'path-to-app-root', value: 'app' },
            ],
            workspaces: [
              { name: 'source', workspace: 'git-source' },
              { name: 'dockerconfig', workspace: 'dockerconfig' },
            ],
          },
        ],
      },
    });
  }
}
