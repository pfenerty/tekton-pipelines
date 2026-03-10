import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { DEFAULT_GOLANG_VERSION, DEFAULT_GOLANG_VARIANT } from '../constants';

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
          name: 'build-path',
          description: 'The build directory used by task',
          type: 'string',
          default: './',
        },
        {
          name: 'golang-version',
          description: 'golang version to use for the build',
          type: 'string',
          default: DEFAULT_GOLANG_VERSION,
        },
        {
          name: 'golang-variant',
          description: 'golang image variant to use for the build',
          type: 'string',
          default: DEFAULT_GOLANG_VARIANT,
        },
      ],
      steps: [
        {
          name: 'build',
          image: 'golang:$(params.golang-version)-$(params.golang-variant)',
          workingDir: '/go',
          command: ['go', 'build'],
          args: ['-C=$(workspaces.workspace.path)/$(params.build-path)'],
        },
      ],
      workspaces: [{ name: 'workspace' }],
    };
  }
}
