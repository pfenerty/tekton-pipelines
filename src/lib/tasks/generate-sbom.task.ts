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
  static readonly defaultName = 'generate-sbom';
  public readonly taskName: string;

  constructor(scope: Construct, id: string, props: GenerateSbomTaskProps) {
    super(scope, id);
    this.taskName = props.name ?? GenerateSbomTask.defaultName;

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

import { PipelineTask } from './pipeline-task';

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
