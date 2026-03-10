import { PipelineTask } from './pipeline-task';

/**
 * Pipeline task step that runs the external cosign-sign-image Task.
 * Signs the published OCI image using Cosign/sigstore.
 *
 * Consumes pipeline param: image-name.
 * Consumes result from BuildOciPipelineTask: image-digest.
 * Binds the 'git-source' and 'dockerconfig' pipeline workspaces.
 */
export class CosignSignImagePipelineTask extends PipelineTask {
  readonly name = 'sign-image';
  private readonly buildStepName: string;

  constructor(opts: { buildStep?: PipelineTask; runAfter?: PipelineTask | PipelineTask[] } = {}) {
    super(opts.runAfter ?? []);
    this.buildStepName = opts.buildStep?.name ?? 'build-image';
  }

  toSpec(): Record<string, unknown> {
    const spec: Record<string, unknown> = {
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
    };
    if (this.runAfter.length > 0) spec.runAfter = this.runAfterNames();
    return spec;
  }
}
