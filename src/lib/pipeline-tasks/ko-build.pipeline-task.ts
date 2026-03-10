import { PipelineTask } from './pipeline-task';

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
    const spec: Record<string, unknown> = {
      name: this.name,
      taskRef: { kind: 'Task', name: 'ko-build' },
      params: [
        { name: 'docker-repo', value: '$(params.image-name)' },
        { name: 'path-to-app-root', value: 'app' },
      ],
      workspaces: [
        { name: 'source', workspace: 'git-source' },
        { name: 'dockerconfig', workspace: 'dockerconfig' },
      ],
    };
    if (this.runAfter.length > 0) spec.runAfter = this.runAfterNames();
    return spec;
  }
}
