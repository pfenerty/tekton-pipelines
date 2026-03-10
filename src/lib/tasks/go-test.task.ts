import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { PipelineTask } from './pipeline-task';
import { DEFAULT_GOLANG_VERSION, DEFAULT_GOLANG_VARIANT } from '../constants';

/**
 * Tekton Task that runs `go test` against a checked-out workspace.
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
          name: 'test',
          image: 'golang:$(params.golang-version)-$(params.golang-variant)',
          workingDir: '$(workspaces.workspace.path)/$(params.build-path)',
          command: ['go', 'test'],
        },
      ],
      workspaces: [{ name: 'workspace' }],
    };
  }
}

/**
 * Pipeline task step that runs the go-test Task.
 *
 * Consumes pipeline params: app-root, build-path, golang-version, golang-variant.
 * Binds the 'workspace' pipeline workspace.
 */
export class GoTestPipelineTask extends PipelineTask {
  readonly name = 'test';

  constructor(opts: { runAfter?: PipelineTask | PipelineTask[] } = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: GoTestTask.defaultName },
      params: [
        { name: 'build-path', value: '$(params.app-root)/$(params.build-path)' },
        { name: 'golang-version', value: '$(params.golang-version)' },
        { name: 'golang-variant', value: '$(params.golang-variant)' },
      ],
      workspaces: [{ name: 'workspace', workspace: 'workspace' }],
    });
  }
}
