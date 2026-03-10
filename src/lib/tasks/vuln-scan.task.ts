import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';

export interface VulnScanTaskProps {
  namespace: string;
  name?: string;
}

/**
 * Tekton Task that scans a SBOM for vulnerabilities using Grype.
 * Writes the vulnerability report to $(workspaces.workspace.path)/vulns.
 *
 * Params exposed at runtime:
 *   sbom-path     - path to the SBOM file to scan
 *   output-format - report format (default: cyclonedx-json)
 */
export class VulnScanTask extends Construct {
  static readonly defaultName = 'vulnerability-scan';
  public readonly taskName: string;

  constructor(scope: Construct, id: string, props: VulnScanTaskProps) {
    super(scope, id);
    this.taskName = props.name ?? VulnScanTask.defaultName;

    new ApiObject(this, 'resource', {
      apiVersion: 'tekton.dev/v1',
      kind: 'Task',
      metadata: {
        name: this.taskName,
        namespace: props.namespace,
      },
      spec: {
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
      },
    });
  }
}

import { PipelineTask } from './pipeline-task';

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
