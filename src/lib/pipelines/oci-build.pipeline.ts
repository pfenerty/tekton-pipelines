import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { FixFilePermsPipelineTask } from '../pipeline-tasks/fix-file-perms.pipeline-task';
import { GitClonePipelineTask } from '../pipeline-tasks/git-clone.pipeline-task';
import { BuildOciPipelineTask } from '../pipeline-tasks/build-oci.pipeline-task';
import { GenerateImageSbomPipelineTask } from '../pipeline-tasks/generate-image-sbom.pipeline-task';
import { CosignSignImagePipelineTask } from '../pipeline-tasks/cosign-sign-image.pipeline-task';

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
 *   fix-file-perms      - (external)
 *   fetch-from-git      - git-clone (Tekton catalog resolver)
 *   build-image         - (external) build-oci
 *   generate-image-sbom - (external) vuln-scan
 *   sign-image          - (external) cosign-sign-image
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

    const fixPerms = new FixFilePermsPipelineTask();
    const clone = new GitClonePipelineTask({ name: 'fetch-from-git', workspace: 'git-source', runAfter: fixPerms });
    const buildImage = new BuildOciPipelineTask({ runAfter: clone });
    const sbom = new GenerateImageSbomPipelineTask({ buildStep: buildImage, runAfter: buildImage });
    const sign = new CosignSignImagePipelineTask({ buildStep: buildImage, runAfter: sbom });

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
        tasks: [fixPerms, clone, buildImage, sbom, sign].map(t => t.toSpec()),
      },
    });
  }
}
