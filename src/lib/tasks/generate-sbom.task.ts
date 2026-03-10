import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { PipelineTask } from './pipeline-task';
import {
  WS_WORKSPACE,
  PARAM_APP_ROOT,
  DEFAULT_OUTPUT_FORMAT,
  PARAM_SCAN_TARGET,
  PARAM_OUTPUT_FORMAT,
  SYFT_IMAGE,
} from '../constants';
import { WORKSPACE_BINDING } from '../workspaces';

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
          name: PARAM_SCAN_TARGET,
          description: 'Name (reference) of the image or path to scan',
          type: 'string',
        },
        {
          name: PARAM_OUTPUT_FORMAT,
          description: 'SBOM output format',
          type: 'string',
          default: DEFAULT_OUTPUT_FORMAT,
        },
      ],
      steps: [
        {
          name: 'generate-sbom',
          image: SYFT_IMAGE,
          workingDir: '/tmp',
          args: [
            `$(params.${PARAM_SCAN_TARGET})`,
            `-o $(params.${PARAM_OUTPUT_FORMAT})=$(workspaces.${WS_WORKSPACE}.path)/sbom`,
            '-o table',
          ],
        },
      ],
      workspaces: [{ name: WS_WORKSPACE }],
    };
  }
}

/**
 * Pipeline task step that runs the generate-sbom Task against source code.
 *
 * Consumes pipeline param: app-root (to build the scan-target path).
 * Binds the 'workspace' pipeline workspace. Writes SBOM to workspace/sbom.
 */
export interface GenerateSbomPipelineTaskOptions {
  runAfter?: PipelineTask | PipelineTask[];
}

export class GenerateSbomPipelineTask extends PipelineTask {
  readonly name = 'generate-sbom';

  constructor(opts: GenerateSbomPipelineTaskOptions = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: GenerateSbomTask.defaultName },
      params: [
        {
          name: PARAM_SCAN_TARGET,
          value: `$(workspaces.${WS_WORKSPACE}.path)/$(params.${PARAM_APP_ROOT})`,
        },
      ],
      workspaces: [WORKSPACE_BINDING],
    });
  }
}
