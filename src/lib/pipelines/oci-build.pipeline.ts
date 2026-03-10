import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';

export interface OciBuildPipelineProps {
  namespace: string;
  name?: string;
}

/**
 * Full OCI supply-chain pipeline: build image → generate SBOM → vulnerability
 * scan → sign image with Cosign.
 *
 * References external Tasks not managed in this repo:
 *   fix-file-perms    - ensures workspace has correct permissions
 *   build-oci         - builds and pushes an OCI image; exposes result image-digest
 *   vuln-scan         - runs vulnerability scanning on an image reference
 *   cosign-sign-image - signs the published image using Cosign/sigstore
 *
 * Tasks:
 *   fix-file-perms    - (external)
 *   fetch-from-git    - git-clone (Tekton catalog resolver)
 *   build-image       - (external) build-oci
 *   generate-image-sbom - (external) vuln-scan
 *   sign-image        - (external) cosign-sign-image
 *
 * Params exposed at runtime:
 *   git-url      - repository URL
 *   git-revision - commit SHA / branch
 *   image-name   - fully-qualified image name (registry/repo:tag)
 */
export class OciBuildPipeline extends Construct {
  public readonly pipelineName: string;

  constructor(scope: Construct, id: string, props: OciBuildPipelineProps) {
    super(scope, id);
    this.pipelineName = props.name ?? 'oci-build';

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
            name: 'fetch-from-git',
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
            name: 'build-image',
            runAfter: ['fetch-from-git'],
            taskRef: { kind: 'Task', name: 'build-oci' },
            params: [
              { name: 'image-name', value: '$(params.image-name)' },
            ],
            workspaces: [
              { name: 'source', workspace: 'git-source' },
              { name: 'dockerconfig', workspace: 'dockerconfig' },
            ],
          },
          {
            name: 'generate-image-sbom',
            runAfter: ['build-image'],
            taskRef: { kind: 'Task', name: 'vuln-scan' },
            params: [
              { name: 'image-name', value: '$(params.image-name)' },
              { name: 'image-digest', value: '$(tasks.build-image.results.image-digest)' },
            ],
            workspaces: [
              { name: 'source', workspace: 'git-source' },
              { name: 'dockerconfig', workspace: 'dockerconfig' },
            ],
          },
          {
            name: 'sign-image',
            runAfter: ['generate-image-sbom'],
            taskRef: { kind: 'Task', name: 'cosign-sign-image' },
            params: [
              { name: 'image-name', value: '$(params.image-name)' },
              { name: 'image-digest', value: '$(tasks.build-image.results.image-digest)' },
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
