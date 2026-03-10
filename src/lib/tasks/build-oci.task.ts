import { PipelineTask } from './pipeline-task';
import { PARAM_IMAGE_NAME } from '../constants';
import { GIT_SOURCE_BINDING, DOCKERCONFIG_BINDING } from '../workspaces';

/**
 * Pipeline task step that runs the external build-oci Task.
 * Builds and pushes an OCI image; exposes result 'image-digest'.
 *
 * Consumes pipeline param: image-name.
 * Binds the 'git-source' and 'dockerconfig' pipeline workspaces.
 */
export interface BuildOciPipelineTaskOptions {
  runAfter?: PipelineTask | PipelineTask[];
}

export class BuildOciPipelineTask extends PipelineTask {
  readonly name = 'build-image';

  constructor(opts: BuildOciPipelineTaskOptions = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: 'build-oci' },
      params: [
        { name: PARAM_IMAGE_NAME, value: `$(params.${PARAM_IMAGE_NAME})` },
      ],
      workspaces: [GIT_SOURCE_BINDING, DOCKERCONFIG_BINDING],
    });
  }
}
