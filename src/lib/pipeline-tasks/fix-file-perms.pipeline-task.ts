import { PipelineTask } from './pipeline-task';

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
    this.sourceWorkspace = opts.sourceWorkspace ?? 'git-source';
  }

  toSpec(): Record<string, unknown> {
    const spec: Record<string, unknown> = {
      name: this.name,
      taskRef: { kind: 'Task', name: 'fix-file-perms' },
      workspaces: [{ name: 'source', workspace: this.sourceWorkspace }],
    };
    if (this.runAfter.length > 0) spec.runAfter = this.runAfterNames();
    return spec;
  }
}
