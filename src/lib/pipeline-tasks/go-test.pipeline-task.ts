import { PipelineTask } from './pipeline-task';
import { GoTestTask } from '../tasks/go-test.task';

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
    const spec: Record<string, unknown> = {
      name: this.name,
      taskRef: { kind: 'Task', name: GoTestTask.defaultName },
      params: [
        { name: 'build-path', value: '$(params.app-root)/$(params.build-path)' },
        { name: 'golang-version', value: '$(params.golang-version)' },
        { name: 'golang-variant', value: '$(params.golang-variant)' },
      ],
      workspaces: [{ name: 'workspace', workspace: 'workspace' }],
    };
    if (this.runAfter.length > 0) spec.runAfter = this.runAfterNames();
    return spec;
  }
}
