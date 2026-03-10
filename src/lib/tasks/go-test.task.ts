import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';

export interface GoTestTaskProps {
  namespace: string;
  name?: string;
}

/**
 * Tekton Task that runs `go test` against a checked-out workspace.
 *
 * Params exposed at runtime:
 *   build-path     - directory to run tests in (default: ./)
 *   golang-version - Go toolchain version (default: 1.23.0)
 *   golang-variant - base image variant, e.g. alpine (default: alpine)
 */
export class GoTestTask extends Construct {
  public readonly taskName: string;

  constructor(scope: Construct, id: string, props: GoTestTaskProps) {
    super(scope, id);
    this.taskName = props.name ?? 'test-go';

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
            name: 'build-path',
            description: 'The build directory used by task',
            type: 'string',
            default: './',
          },
          {
            name: 'golang-version',
            description: 'golang version to use for the build',
            type: 'string',
            default: '1.23.0',
          },
          {
            name: 'golang-variant',
            description: 'golang image variant to use for the build',
            type: 'string',
            default: 'alpine',
          },
        ],
        steps: [
          {
            name: 'test',
            image: 'golang:$(params.golang-version)-$(params.golang-variant)',
            workingDir: '$(workspaces.workspace.path)/$(params.build-path)',
            command: ['go', 'test'],
          },
        ],
        workspaces: [{ name: 'workspace' }],
      },
    });
  }
}
