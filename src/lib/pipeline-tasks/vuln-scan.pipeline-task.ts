import { PipelineTask } from './pipeline-task';
import { VulnScanTask } from '../tasks/vuln-scan.task';

/**
 * Pipeline task step that runs the vulnerability-scan Task against a SBOM.
 *
 * Reads the SBOM from workspace/sbom (the default output of GenerateSbomPipelineTask).
 * Binds the 'workspace' pipeline workspace.
 */
export class VulnScanPipelineTask extends PipelineTask {
  readonly name = 'vulnerability-scan';

  constructor(opts: { runAfter?: PipelineTask | PipelineTask[] } = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    const spec: Record<string, unknown> = {
      name: this.name,
      taskRef: { kind: 'Task', name: VulnScanTask.defaultName },
      params: [
        { name: 'sbom-path', value: '$(workspaces.workspace.path)/sbom' },
      ],
      workspaces: [{ name: 'workspace', workspace: 'workspace' }],
    };
    if (this.runAfter.length > 0) spec.runAfter = this.runAfterNames();
    return spec;
  }
}
