import { Construct } from "constructs";
import { TektonTaskConstruct, TektonTaskProps } from "./tekton-task-construct";
import { PipelineTask } from "./pipeline-task";
import {
    WS_WORKSPACE,
    WS_BASIC_AUTH,
    WS_SSH_DIRECTORY,
    PARAM_GIT_URL,
    PARAM_GIT_REVISION,
    CHAINGUARD_GIT_IMAGE,
    RESTRICTED_STEP_SECURITY_CONTEXT,
} from "../constants";
import { BASIC_AUTH_BINDING, SSH_DIRECTORY_BINDING } from "../workspaces";

/**
 * Bundled Tekton Task that clones a git repository into the 'output' workspace.
 *
 * Replaces the Tekton catalog git-clone task (resolved via the git resolver) with
 * an inline Task resource we control. This ensures the step's security context
 * is set correctly for PodSecurity "restricted" namespaces without relying on the
 * Tekton feature-flags ConfigMap.
 *
 * Params:
 *   url      - repository URL to clone
 *   revision - commit SHA or branch to check out
 *
 * Workspaces:
 *   output   - directory to clone into
 */
export class GitCloneTask extends TektonTaskConstruct {
    static readonly defaultName = "git-clone";

    constructor(scope: Construct, id: string, props: TektonTaskProps) {
        super(scope, id, props, GitCloneTask.defaultName);
    }

    protected buildTaskSpec(): Record<string, unknown> {
        return {
            stepTemplate: { securityContext: RESTRICTED_STEP_SECURITY_CONTEXT },
            params: [
                {
                    name: "url",
                    type: "string",
                    description: "Repository URL to clone",
                },
                {
                    name: "revision",
                    type: "string",
                    description: "Commit SHA or branch to check out",
                },
            ],
            workspaces: [
                { name: "output", description: "Directory to clone into" },
                {
                    name: WS_BASIC_AUTH,
                    description:
                        "Optional. Secret with username/password for HTTPS auth.",
                    optional: true,
                },
                {
                    name: WS_SSH_DIRECTORY,
                    description:
                        "Optional. Secret with SSH private key files for SSH auth.",
                    optional: true,
                },
            ],
            steps: [
                {
                    name: "clone",
                    image: CHAINGUARD_GIT_IMAGE,
                    workingDir: "$(workspaces.output.path)",
                    env: [
                        { name: "HOME", value: "/home/git" },
                        { name: "GIT_TERMINAL_PROMPT", value: "0" },
                    ],
                    script: `#!/bin/sh
set -e

git config --global --add safe.directory /workspace/output

# SSH auth: copy key from mounted Secret, set permissions, configure GIT_SSH_COMMAND
if [ "$(workspaces.ssh-directory.bound)" = "true" ]; then
  mkdir -p "\${HOME}/.ssh"
  cp "$(workspaces.ssh-directory.path)"/* "\${HOME}/.ssh/"
  chmod 700 "\${HOME}/.ssh"
  chmod 600 "\${HOME}/.ssh"/*
  # If no known_hosts provided, skip strict host checking to avoid hanging
  if [ ! -f "\${HOME}/.ssh/known_hosts" ]; then
    printf 'StrictHostKeyChecking no\\n' > "\${HOME}/.ssh/config"
    chmod 600 "\${HOME}/.ssh/config"
  fi
  # Pick the first available private key (common names)
  for _key in id_rsa id_ed25519 id_ecdsa; do
    if [ -f "\${HOME}/.ssh/\${_key}" ]; then
      export GIT_SSH_COMMAND="ssh -i \${HOME}/.ssh/\${_key} -F \${HOME}/.ssh/config"
      break
    fi
  done
fi

# HTTPS basic-auth: write ~/.git-credentials from Secret username/password keys
if [ "$(workspaces.basic-auth.bound)" = "true" ]; then
  _user=$(cat "$(workspaces.basic-auth.path)/username")
  _pass=$(cat "$(workspaces.basic-auth.path)/password")
  _url="$(params.url)"
  _host="\${_url#*://}"
  _host="\${_host%%/*}"
  git config --global credential.helper store
  printf 'https://%s:%s@%s\\n' "$_user" "$_pass" "$_host" > "\${HOME}/.git-credentials"
  chmod 600 "\${HOME}/.git-credentials"
fi

git clone -v "$(params.url)" .
git checkout "$(params.revision)"
`,
                },
            ],
        };
    }
}

export interface GitClonePipelineTaskOptions {
    /** Step name within the pipeline. Defaults to 'clone'. */
    name?: string;
    /** Pipeline workspace to bind as the clone output. Defaults to 'workspace'. */
    workspace?: string;
    runAfter?: PipelineTask | PipelineTask[];
    /** Bind the 'basic-auth' pipeline workspace for HTTPS token auth. Default: false. */
    basicAuth?: boolean;
    /** Bind the 'ssh-directory' pipeline workspace for SSH key auth. Default: false. */
    sshDirectory?: boolean;
}

/**
 * Pipeline task step that clones a git repository using the bundled GitCloneTask.
 *
 * Consumes pipeline params: git-url, git-revision.
 */
export class GitClonePipelineTask extends PipelineTask {
    readonly name: string;
    private readonly workspace: string;
    private readonly basicAuth: boolean;
    private readonly sshDirectory: boolean;

    constructor(opts: GitClonePipelineTaskOptions = {}) {
        super(opts.runAfter ?? []);
        this.name = opts.name ?? "clone";
        this.workspace = opts.workspace ?? WS_WORKSPACE;
        this.basicAuth = opts.basicAuth ?? false;
        this.sshDirectory = opts.sshDirectory ?? false;
    }

    toSpec(): Record<string, unknown> {
        const workspaces: Record<string, unknown>[] = [
            { name: "output", workspace: this.workspace },
        ];
        if (this.basicAuth) workspaces.push(BASIC_AUTH_BINDING);
        if (this.sshDirectory) workspaces.push(SSH_DIRECTORY_BINDING);

        return this.buildSpec({
            name: this.name,
            taskRef: { kind: "Task", name: GitCloneTask.defaultName },
            params: [
                { name: "url", value: `$(params.${PARAM_GIT_URL})` },
                { name: "revision", value: `$(params.${PARAM_GIT_REVISION})` },
            ],
            workspaces,
        });
    }
}
