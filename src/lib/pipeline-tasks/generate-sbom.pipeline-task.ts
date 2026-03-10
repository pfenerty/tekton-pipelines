import { PipelineTask } from './pipeline-task';
import { GenerateSbomTask } from '../tasks/generate-sbom.task';

/**
 * Pipeline task step that runs the generate-sbom Task against source code.
 *
 * Consumes pipeline param: app-root (to build the scan-target path).
 * Binds the 'workspace' pipeline workspace. Writes SBOM to workspace/sbom.
 */
export class GenerateSbomPipelineTask extends PipelineTask {
  readonly name = 'generate-sbom';

  constructor(opts: { runAfter?: PipelineTask | PipelineTask[] } = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    const spec: Record<string, unknown> = {
      name: this.name,
      taskRef: { kind: 'Task', name: GenerateSbomTask.defaultName },
      params: [
        {
          name: 'scan-target',
          value: '$(workspaces.workspace.path)/$(params.app-root)',
        },
      ],
      workspaces: [{ name: 'workspace', workspace: 'workspace' }],
    };
    if (this.runAfter.length > 0) spec.runAfter = this.runAfterNames();
    return spec;
  }
}
