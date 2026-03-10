import { ImageDependentPipelineTask } from './image-dependent-pipeline-task';
import { PipelineTask } from './pipeline-task';
import { PARAM_IMAGE_NAME, PARAM_IMAGE_DIGEST } from '../constants';
import { GIT_SOURCE_BINDING, DOCKERCONFIG_BINDING } from '../workspaces';

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
        { name: PARAM_IMAGE_NAME, value: `$(params.${PARAM_IMAGE_NAME})` },
        { name: PARAM_IMAGE_DIGEST, value: `$(tasks.${this.buildStepName}.results.${PARAM_IMAGE_DIGEST})` },
      ],
      workspaces: [GIT_SOURCE_BINDING, DOCKERCONFIG_BINDING],
    });
  }
}
