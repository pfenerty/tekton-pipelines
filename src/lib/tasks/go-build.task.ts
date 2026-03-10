import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { WS_WORKSPACE, PARAM_BUILD_PATH, PARAM_GOLANG_VERSION, PARAM_GOLANG_VARIANT } from '../constants';
import { GOLANG_VERSION_PARAM_SPEC, GOLANG_VARIANT_PARAM_SPEC } from '../params';

/**
 * Tekton Task that runs `go build` against a checked-out workspace.
 *
 * Params exposed at runtime:
 *   build-path     - path passed to -C flag (default: ./)
 *   golang-version - Go toolchain version (default: 1.23.0)
 *   golang-variant - base image variant, e.g. alpine (default: alpine)
 */
export class GoBuildTask extends TektonTaskConstruct {
  static readonly defaultName = 'build-go';

  constructor(scope: Construct, id: string, props: TektonTaskProps) {
    super(scope, id, props, GoBuildTask.defaultName);
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
          name: 'build',
          image: `golang:$(params.${PARAM_GOLANG_VERSION})-$(params.${PARAM_GOLANG_VARIANT})`,
          workingDir: '/go',
          command: ['go', 'build'],
          args: [`-C=$(workspaces.${WS_WORKSPACE}.path)/$(params.${PARAM_BUILD_PATH})`],
        },
      ],
      workspaces: [{ name: WS_WORKSPACE }],
    };
  }
}
