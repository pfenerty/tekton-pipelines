import { PipelineTask } from './pipeline-task';
import { PARAM_IMAGE_NAME } from '../constants';
import { GIT_SOURCE_BINDING, DOCKERCONFIG_BINDING } from '../workspaces';

/**
 * Pipeline task step that runs the external ko-build Task.
 * Builds and pushes an OCI image using Ko.
 *
 * Consumes pipeline param: image-name.
 * Binds the 'git-source' and 'dockerconfig' pipeline workspaces.
 */
export class KoBuildPipelineTask extends PipelineTask {
  readonly name = 'build';

  constructor(opts: { runAfter?: PipelineTask | PipelineTask[] } = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: 'ko-build' },
      params: [
        { name: 'docker-repo', value: `$(params.${PARAM_IMAGE_NAME})` },
        { name: 'path-to-app-root', value: 'app' },
      ],
      workspaces: [GIT_SOURCE_BINDING, DOCKERCONFIG_BINDING],
    });
  }
}
