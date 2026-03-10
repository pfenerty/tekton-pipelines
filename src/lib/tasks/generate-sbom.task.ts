import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { PipelineTask } from './pipeline-task';

/**
 * Tekton Task that generates a Software Bill of Materials using Syft.
 * Writes the SBOM to $(workspaces.workspace.path)/sbom.
 *
 * Params exposed at runtime:
 *   scan-target   - image reference or directory path to scan
 *   output-format - SBOM format (default: cyclonedx-json)
 */
export class GenerateSbomTask extends TektonTaskConstruct {
  static readonly defaultName = 'generate-sbom';

  constructor(scope: Construct, id: string, props: TektonTaskProps) {
    super(scope, id, props, GenerateSbomTask.defaultName);
  }

  protected buildTaskSpec(): Record<string, unknown> {
    return {
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
    };
  }
}

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
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: GenerateSbomTask.defaultName },
      params: [
        {
          name: 'scan-target',
          value: '$(workspaces.workspace.path)/$(params.app-root)',
        },
      ],
      workspaces: [{ name: 'workspace', workspace: 'workspace' }],
    });
  }
}
