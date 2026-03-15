import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { PipelineTask } from './pipeline-task';
import { WS_WORKSPACE, CHAINGUARD_GIT_IMAGE } from '../constants';
import { WORKSPACE_BINDING } from '../workspaces';

/**
 * Tekton Task that logs structured git state information about the current
 * HEAD commit in the checked-out workspace.
 *
 * Intended to run after git-clone. Emits: commit hash, author, date, subject,
 * body (if present), remote URL, branch/ref, changed files, and diff stats.
 */
export class GitLogTask extends TektonTaskConstruct {
  static readonly defaultName = 'git-log';

  constructor(scope: Construct, id: string, props: TektonTaskProps) {
    super(scope, id, props, GitLogTask.defaultName);
  }

  protected buildTaskSpec(): Record<string, unknown> {
    return {
      steps: [
        {
          name: 'log-git-state',
          image: CHAINGUARD_GIT_IMAGE,
          workingDir: `$(workspaces.${WS_WORKSPACE}.path)`,
          script: `#!/bin/sh
set -e

DIVIDER="══════════════════════════════════════"

echo "$DIVIDER"
echo " Git State"
echo "$DIVIDER"
echo ""

echo "--- Commit ---"
echo "Hash (full):  $(git rev-parse HEAD)"
echo "Hash (short): $(git rev-parse --short HEAD)"
echo "Author:       $(git log -1 --pretty='%aN <%aE>')"
echo "Date:         $(git log -1 --pretty='%aI')"
echo "Subject:      $(git log -1 --pretty='%s')"
BODY="$(git log -1 --pretty='%b')"
if [ -n "$BODY" ]; then
  echo ""
  echo "Body:"
  echo "$BODY" | sed 's/^/  /'
fi
echo ""

echo "--- Repository ---"
if git remote get-url origin > /dev/null 2>&1; then
  echo "Remote URL:   $(git remote get-url origin)"
else
  echo "Remote URL:   (no remote configured)"
fi
BRANCH="$(git symbolic-ref HEAD 2>/dev/null || echo 'detached HEAD')"
echo "Branch/Ref:   $BRANCH"
echo ""

echo "--- Changed Files ---"
git diff-tree --no-commit-id -r --name-status HEAD
echo ""

echo "--- Diff Stats ---"
git show --stat --no-patch HEAD
echo ""

echo "$DIVIDER"
`,
        },
      ],
      workspaces: [{ name: WS_WORKSPACE }],
    };
  }
}

/**
 * Pipeline task step that runs the git-log Task.
 *
 * Binds the 'workspace' pipeline workspace. Typically placed after git-clone.
 */
export interface GitLogPipelineTaskOptions {
  runAfter?: PipelineTask | PipelineTask[];
}

export class GitLogPipelineTask extends PipelineTask {
  readonly name = 'log-git-state';

  constructor(opts: GitLogPipelineTaskOptions = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: GitLogTask.defaultName },
      workspaces: [WORKSPACE_BINDING],
    });
  }
}
