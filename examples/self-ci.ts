import {
    Param,
    Workspace,
    Task,
    Pipeline,
    TektonProject,
    TRIGGER_EVENTS,
    RESTRICTED_STEP_SECURITY_CONTEXT,
    GitHubStatusReporter,
} from "../src";

// ─── Images ──────────────────────────────────────────────────────────────────
const gitImage = "cgr.dev/chainguard/git:latest";
const nodeImage = "node:22-alpine";
const syftImage = "ghcr.io/anchore/syft:v1.42.3";
const grypeImage = "ghcr.io/anchore/grype:v0.110.0";
const grantImage = "ghcr.io/anchore/grant:v0.6.4";

// ─── Shared workspace ────────────────────────────────────────────────────────
const workspace = new Workspace({ name: "workspace" });

// ─── Params ──────────────────────────────────────────────────────────────────
const urlParam = new Param({ name: "url", type: "string" });
const revisionParam = new Param({ name: "revision", type: "string" });
const buildPathParam = new Param({
    name: "build-path",
    type: "string",
    default: "./",
});
const repoFullName = new Param({ name: "repo-full-name", type: "string" });
const refParam = new Param({ name: "ref", type: "string" });

// ─── Status reporter ─────────────────────────────────────────────────────────
const statusReporter = new GitHubStatusReporter({
    repoFullNameParam: repoFullName,
    revisionParam: revisionParam,
});

// ─── Tasks ───────────────────────────────────────────────────────────────────
const gitClone = new Task({
    name: "git-clone",
    stepTemplate: { securityContext: RESTRICTED_STEP_SECURITY_CONTEXT },
    params: [urlParam, revisionParam],
    workspaces: [workspace],
    steps: [
        {
            name: "clone",
            image: gitImage,
            workingDir: workspace.path,
            script: `#!/bin/sh
set -e
git clone -v $(params.url) .
git config --global --add safe.directory ${workspace.path}
git checkout $(params.revision)`,
        },
    ],
});

const npmTest = new Task({
    name: "test-npm",
    params: [buildPathParam, repoFullName, revisionParam],
    workspaces: [workspace],
    needs: [gitClone],
    statusContext: "tektonic-ci/test",
    statusReporter,
    steps: [
        {
            name: "test",
            image: nodeImage,
            workingDir: `${workspace.path}/$(params.build-path)`,
            command: ["sh", "-c"],
            args: [
                "npm ci && npm test; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC",
            ],
            onError: "continue",
        },
    ],
});

const npmBuild = new Task({
    name: "build-npm",
    params: [buildPathParam, repoFullName, revisionParam],
    workspaces: [workspace],
    needs: [npmTest],
    statusContext: "tektonic-ci/build",
    statusReporter,
    steps: [
        {
            name: "build",
            image: nodeImage,
            workingDir: `${workspace.path}/$(params.build-path)`,
            command: ["sh", "-c"],
            args: [
                "npm run build; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC",
            ],
            onError: "continue",
        },
    ],
});

const anchoreScann = new Task({
    name: "anchore-scan",
    params: [repoFullName, revisionParam, refParam],
    workspaces: [workspace],
    needs: [gitClone],
    statusContext: "tektonic-ci/scan",
    statusReporter,
    steps: [
        {
            name: "generate-sbom",
            image: syftImage,
            workingDir: workspace.path,
            command: ["/syft"],
            args: [
                "file:package-lock.json",
                "-o",
                "cyclonedx-json=sbom.cyclonedx.json",
                "-o",
                "syft-table",
            ],
        },
        {
            name: "scan",
            image: grypeImage,
            workingDir: workspace.path,
            command: ["/grype"],
            args: [
                "-v",
                "sbom:./sbom.cyclonedx.json",
                "-o",
                "sarif=./scan.sarif",
            ],
            onError: "continue",
        },
        {
            name: "check-licenses",
            image: grantImage,
            workingDir: workspace.path,
            command: ["/grant"],
            args: [
                "check",
                "./sbom.cyclonedx.json",
                "-o",
                "table",
                "--dry-run",
            ],
            onError: "continue",
        },
        {
            name: "upload-sarif",
            image: "cgr.dev/chainguard/curl:latest-dev",
            workingDir: workspace.path,
            env: [
                {
                    name: "GITHUB_TOKEN",
                    valueFrom: {
                        secretKeyRef: { name: "github-token", key: "token" },
                    },
                },
            ],
            command: ["sh", "-c"],
            args: [
                `GRYPE_EC=$(cat /tekton/steps/step-scan/exitCode 2>/dev/null || echo 0)
echo "$GRYPE_EC" > /tekton/home/.exit-code
if [ -s scan.sarif ]; then
  REF="$(params.ref)"
  case "$REF" in refs/*) ;; *) REF="refs/heads/$REF" ;; esac
  SARIF=$(gzip -c scan.sarif | base64 | tr -d '\\n')
  curl -fsS -X POST \\
    -H "Authorization: token $GITHUB_TOKEN" \\
    -H "Accept: application/vnd.github+json" \\
    -H "Content-Type: application/json" \\
    -d "{\\"commit_sha\\":\\"$(params.revision)\\",\\"ref\\":\\"$REF\\",\\"sarif\\":\\"$SARIF\\"}" \\
    "https://api.github.com/repos/$(params.repo-full-name)/code-scanning/sarifs"
fi`,
            ],
            onError: "continue",
        },
    ],
});

// ─── Pipelines ───────────────────────────────────────────────────────────────
const pushPipeline = new Pipeline({
    name: "npm-push",
    triggers: [TRIGGER_EVENTS.PUSH],
    tasks: [npmTest, anchoreScann],
});

const prPipeline = new Pipeline({
    name: "npm-pull-request",
    triggers: [TRIGGER_EVENTS.PULL_REQUEST],
    tasks: [npmTest, npmBuild, anchoreScann],
});

// ─── Synthesize ──────────────────────────────────────────────────────────────
new TektonProject({
    name: "tektonic",
    namespace: "tektonic-ci",
    pipelines: [pushPipeline, prPipeline],
    outdir: "ci-pipeline",
    webhookSecretRef: {
        secretName: "github-webhook-secret",
        secretKey: "secret",
    },
    gitRefParam: "ref",
});
