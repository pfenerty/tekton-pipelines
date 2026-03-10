import { ImageDependentPipelineTask } from './image-dependent-pipeline-task';
import { PipelineTask } from './pipeline-task';

/**
 * Pipeline task step that runs the external cosign-sign-image Task.
 * Signs the published OCI image using Cosign/sigstore.
 *
 * Consumes pipeline param: image-name.
 * Consumes result from BuildOciPipelineTask: image-digest.
 * Binds the 'git-source' and 'dockerconfig' pipeline workspaces.
 */
export class CosignSignImagePipelineTask extends ImageDependentPipelineTask {
  readonly name = 'sign-image';

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: 'cosign-sign-image' },
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
