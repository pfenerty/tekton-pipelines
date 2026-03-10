import { PipelineTask } from './pipeline-task';
import { WS_GIT_SOURCE } from '../constants';

/**
 * Pipeline task step that runs the external fix-file-perms Task.
 * Ensures the workspace has correct permissions before git-clone runs.
 *
 * Binds the given pipeline workspace as 'source'. Defaults to 'git-source'.
 */
export class FixFilePermsPipelineTask extends PipelineTask {
  readonly name = 'fix-file-perms';
  private readonly sourceWorkspace: string;

  constructor(opts: { sourceWorkspace?: string; runAfter?: PipelineTask | PipelineTask[] } = {}) {
    super(opts.runAfter ?? []);
    this.sourceWorkspace = opts.sourceWorkspace ?? WS_GIT_SOURCE;
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: 'fix-file-perms' },
      workspaces: [{ name: 'source', workspace: this.sourceWorkspace }],
    });
  }
}
