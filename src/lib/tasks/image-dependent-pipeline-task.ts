import { PipelineTask } from './pipeline-task';

/**
 * Abstract base class for pipeline tasks that consume the image-digest result
 * from an upstream image-build step (e.g. cosign signing, image SBOM generation).
 *
 * Subclasses receive the optional buildStep reference whose name is used to
 * resolve $(tasks.<name>.results.image-digest) at runtime.
 */
export abstract class ImageDependentPipelineTask extends PipelineTask {
  protected readonly buildStepName: string;

  constructor(opts: { buildStep?: PipelineTask; runAfter?: PipelineTask | PipelineTask[] } = {}) {
    super(opts.runAfter ?? []);
    this.buildStepName = opts.buildStep?.name ?? 'build-image';
  }
}
