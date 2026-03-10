import { ImageDependentPipelineTask } from './image-dependent-pipeline-task';

/**
 * Pipeline task step that runs the external vuln-scan Task against an OCI image.
 * Distinct from VulnScanPipelineTask: this scans an image reference rather than
 * a SBOM file, and is intended for use after an image build step.
 *
 * Consumes pipeline param: image-name.
 * Consumes result from BuildOciPipelineTask: image-digest.
 * Binds the 'git-source' and 'dockerconfig' pipeline workspaces.
 */
export class GenerateImageSbomPipelineTask extends ImageDependentPipelineTask {
  readonly name = 'generate-image-sbom';

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: 'vuln-scan' },
      params: [
        { name: 'image-name', value: '$(params.image-name)' },
        { name: 'image-digest', value: `$(tasks.${this.buildStepName}.results.image-digest)` },
      ],
      workspaces: [
        { name: 'source', workspace: 'git-source' },
        { name: 'dockerconfig', workspace: 'dockerconfig' },
      ],
    });
  }
}
