import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { PipelineTask } from './pipeline-task';

/**
 * Tekton Task that scans a SBOM for vulnerabilities using Grype.
 * Writes the vulnerability report to $(workspaces.workspace.path)/vulns.
 *
 * Params exposed at runtime:
 *   sbom-path     - path to the SBOM file to scan
 *   output-format - report format (default: cyclonedx-json)
 */
export class VulnScanTask extends TektonTaskConstruct {
  static readonly defaultName = 'vulnerability-scan';

  constructor(scope: Construct, id: string, props: TektonTaskProps) {
    super(scope, id, props, VulnScanTask.defaultName);
  }

  protected buildTaskSpec(): Record<string, unknown> {
    return {
      params: [
        {
          name: 'sbom-path',
          description: 'Path to the sbom to scan',
          type: 'string',
        },
        {
          name: 'output-format',
          description: 'Vulnerability report format',
          type: 'string',
          default: 'cyclonedx-json',
        },
      ],
      steps: [
        {
          name: 'vulnerability-scan',
          image: 'anchore/grype:v0.79.6-debug',
          workingDir: '/tmp',
          args: [
            'sbom:$(params.sbom-path)',
            '-o $(params.output-format)=$(workspaces.workspace.path)/vulns',
            '-o table',
          ],
        },
      ],
      workspaces: [{ name: 'workspace' }],
    };
  }
}

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
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: VulnScanTask.defaultName },
      params: [
        { name: 'sbom-path', value: '$(workspaces.workspace.path)/sbom' },
      ],
      workspaces: [{ name: 'workspace', workspace: 'workspace' }],
    });
  }
}
