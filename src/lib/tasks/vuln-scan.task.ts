import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { PipelineTask } from './pipeline-task';
import { WS_WORKSPACE, DEFAULT_OUTPUT_FORMAT, PARAM_SBOM_PATH, PARAM_OUTPUT_FORMAT, GRYPE_IMAGE } from '../constants';
import { WORKSPACE_BINDING } from '../workspaces';

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
          name: PARAM_SBOM_PATH,
          description: 'Path to the sbom to scan',
          type: 'string',
        },
        {
          name: PARAM_OUTPUT_FORMAT,
          description: 'Vulnerability report format',
          type: 'string',
          default: DEFAULT_OUTPUT_FORMAT,
        },
      ],
      steps: [
        {
          name: 'vulnerability-scan',
          image: GRYPE_IMAGE,
          workingDir: '/tmp',
          args: [
            `sbom:$(params.${PARAM_SBOM_PATH})`,
            `-o $(params.${PARAM_OUTPUT_FORMAT})=$(workspaces.${WS_WORKSPACE}.path)/vulns`,
            '-o table',
          ],
        },
      ],
      workspaces: [{ name: WS_WORKSPACE }],
    };
  }
}

/**
 * Pipeline task step that runs the vulnerability-scan Task against a SBOM.
 *
 * Reads the SBOM from workspace/sbom (the default output of GenerateSbomPipelineTask).
 * Binds the 'workspace' pipeline workspace.
 */
export interface VulnScanPipelineTaskOptions {
  runAfter?: PipelineTask | PipelineTask[];
}

export class VulnScanPipelineTask extends PipelineTask {
  readonly name = 'vulnerability-scan';

  constructor(opts: VulnScanPipelineTaskOptions = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: VulnScanTask.defaultName },
      params: [
        { name: PARAM_SBOM_PATH, value: `$(workspaces.${WS_WORKSPACE}.path)/sbom` },
      ],
      workspaces: [WORKSPACE_BINDING],
    });
  }
}
