import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { PipelineTask } from './pipeline-task';
import { WS_WORKSPACE, PARAM_BUILD_PATH, PARAM_GOLANG_VERSION, PARAM_GOLANG_VARIANT, PARAM_APP_ROOT } from '../constants';
import { GOLANG_VERSION_PARAM_SPEC, GOLANG_VARIANT_PARAM_SPEC } from '../params';
import { WORKSPACE_BINDING } from '../workspaces';

/**
 * Tekton Task that runs `go test ./...` against a checked-out workspace.
 *
 * Params exposed at runtime:
 *   build-path     - directory to run tests in (default: ./)
 *   golang-version - Go toolchain version (default: 1.23.0)
 *   golang-variant - base image variant, e.g. alpine (default: alpine)
 */
export class GoTestTask extends TektonTaskConstruct {
  static readonly defaultName = 'test-go';

  constructor(scope: Construct, id: string, props: TektonTaskProps) {
    super(scope, id, props, GoTestTask.defaultName);
  }

  protected buildTaskSpec(): Record<string, unknown> {
    return {
      params: [
        {
          name: PARAM_BUILD_PATH,
          description: 'The build directory used by task',
          type: 'string',
          default: './',
        },
        GOLANG_VERSION_PARAM_SPEC,
        GOLANG_VARIANT_PARAM_SPEC,
      ],
      steps: [
        {
          name: 'test',
          image: `golang:$(params.${PARAM_GOLANG_VERSION})-$(params.${PARAM_GOLANG_VARIANT})`,
          workingDir: `$(workspaces.${WS_WORKSPACE}.path)/$(params.${PARAM_BUILD_PATH})`,
          command: ['go', 'test', './...'],
        },
      ],
      workspaces: [{ name: WS_WORKSPACE }],
    };
  }
}

/**
 * Pipeline task step that runs the go-test Task.
 *
 * Consumes pipeline params: app-root, build-path, golang-version, golang-variant.
 * Binds the 'workspace' pipeline workspace.
 */
export interface GoTestPipelineTaskOptions {
  runAfter?: PipelineTask | PipelineTask[];
}

export class GoTestPipelineTask extends PipelineTask {
  readonly name = 'test';

  constructor(opts: GoTestPipelineTaskOptions = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: GoTestTask.defaultName },
      params: [
        { name: PARAM_BUILD_PATH, value: `$(params.${PARAM_APP_ROOT})/$(params.${PARAM_BUILD_PATH})` },
        { name: PARAM_GOLANG_VERSION, value: `$(params.${PARAM_GOLANG_VERSION})` },
        { name: PARAM_GOLANG_VARIANT, value: `$(params.${PARAM_GOLANG_VARIANT})` },
      ],
      workspaces: [WORKSPACE_BINDING],
    });
  }
}
