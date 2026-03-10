import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';

export interface GenerateSbomTaskProps {
  namespace: string;
  name?: string;
}

/**
 * Tekton Task that generates a Software Bill of Materials using Syft.
 * Writes the SBOM to $(workspaces.workspace.path)/sbom.
 *
 * Params exposed at runtime:
 *   scan-target   - image reference or directory path to scan
 *   output-format - SBOM format (default: cyclonedx-json)
 */
export class GenerateSbomTask extends Construct {
  public readonly taskName: string;

  constructor(scope: Construct, id: string, props: GenerateSbomTaskProps) {
    super(scope, id);
    this.taskName = props.name ?? 'generate-sbom';

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
            name: 'scan-target',
            description: 'Name (reference) of the image or path to scan',
            type: 'string',
          },
          {
            name: 'output-format',
            description: 'SBOM output format',
            type: 'string',
            default: 'cyclonedx-json',
          },
        ],
        steps: [
          {
            name: 'generate-sbom',
            image: 'anchore/syft:v1.11.0-debug',
            workingDir: '/tmp',
            args: [
              '$(params.scan-target)',
              '-o $(params.output-format)=$(workspaces.workspace.path)/sbom',
              '-o table',
            ],
          },
        ],
        workspaces: [{ name: 'workspace' }],
      },
    });
  }
}
