import { PipelineTask } from './pipeline-task';

export interface GitClonePipelineTaskOptions {
  /** Step name within the pipeline. Defaults to 'clone'. */
  name?: string;
  /** Pipeline workspace to bind as the clone output. Defaults to 'workspace'. */
  workspace?: string;
  runAfter?: PipelineTask | PipelineTask[];
}

/**
 * Pipeline task step that clones a git repository using the Tekton catalog
 * git-clone task (resolved via the git resolver).
 *
 * Consumes pipeline params: git-url, git-revision.
 */
export class GitClonePipelineTask extends PipelineTask {
  readonly name: string;
  private readonly workspace: string;

  constructor(opts: GitClonePipelineTaskOptions = {}) {
    super(opts.runAfter ?? []);
    this.name = opts.name ?? 'clone';
    this.workspace = opts.workspace ?? 'workspace';
  }

  toSpec(): Record<string, unknown> {
    const spec: Record<string, unknown> = {
      name: this.name,
      taskRef: {
        resolver: 'git',
        params: [
          { name: 'url', value: 'https://github.com/tektoncd/catalog.git' },
          { name: 'pathInRepo', value: '/task/git-clone/0.9/git-clone.yaml' },
          { name: 'revision', value: 'main' },
        ],
      },
      params: [
        { name: 'url', value: '$(params.git-url)' },
        { name: 'revision', value: '$(params.git-revision)' },
      ],
      workspaces: [{ name: 'output', workspace: this.workspace }],
    };
    if (this.runAfter.length > 0) spec.runAfter = this.runAfterNames();
    return spec;
  }
}
