import { PipelineTask } from './pipeline-task';

/**
 * Pipeline task step that runs the external build-oci Task.
 * Builds and pushes an OCI image; exposes result 'image-digest'.
 *
 * Consumes pipeline param: image-name.
 * Binds the 'git-source' and 'dockerconfig' pipeline workspaces.
 */
export class BuildOciPipelineTask extends PipelineTask {
  readonly name = 'build-image';

  constructor(opts: { runAfter?: PipelineTask | PipelineTask[] } = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    const spec: Record<string, unknown> = {
      name: this.name,
      taskRef: { kind: 'Task', name: 'build-oci' },
      params: [
        { name: 'image-name', value: '$(params.image-name)' },
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
