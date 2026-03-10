import { PipelineTask } from './pipeline-task';
import { PARAM_IMAGE_NAME, PARAM_DOCKER_REPO, PARAM_PATH_TO_APP_ROOT } from '../constants';
import { GIT_SOURCE_BINDING, DOCKERCONFIG_BINDING } from '../workspaces';

/**
 * Pipeline task step that runs the external ko-build Task.
 * Builds and pushes an OCI image using Ko.
 *
 * Consumes pipeline param: image-name.
 * Binds the 'git-source' and 'dockerconfig' pipeline workspaces.
 */
export interface KoBuildPipelineTaskOptions {
  /** Path to the app root within the workspace (default: 'app'). */
  pathToAppRoot?: string;
  runAfter?: PipelineTask | PipelineTask[];
}

export class KoBuildPipelineTask extends PipelineTask {
  readonly name = 'build';
  private readonly pathToAppRoot: string;

  constructor(opts: KoBuildPipelineTaskOptions = {}) {
    super(opts.runAfter ?? []);
    this.pathToAppRoot = opts.pathToAppRoot ?? 'app';
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: 'ko-build' },
      params: [
        { name: PARAM_DOCKER_REPO, value: `$(params.${PARAM_IMAGE_NAME})` },
        { name: PARAM_PATH_TO_APP_ROOT, value: this.pathToAppRoot },
      ],
      workspaces: [GIT_SOURCE_BINDING, DOCKERCONFIG_BINDING],
    });
  }
}
