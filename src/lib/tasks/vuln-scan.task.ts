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
