import { PipelineTask } from './pipeline-task';
import { WS_WORKSPACE, PARAM_GIT_URL, PARAM_GIT_REVISION } from '../constants';

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
    this.workspace = opts.workspace ?? WS_WORKSPACE;
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
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
        { name: 'url', value: `$(params.${PARAM_GIT_URL})` },
        { name: 'revision', value: `$(params.${PARAM_GIT_REVISION})` },
      ],
      workspaces: [{ name: 'output', workspace: this.workspace }],
    });
  }
}
