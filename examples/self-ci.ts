import {
    Param,
    Workspace,
    Task,
    Pipeline,
    TektonProject,
    TRIGGER_EVENTS,
    RESTRICTED_STEP_SECURITY_CONTEXT,
} from "../src";

// --- Variables ───────────────────────────────────────────────────────────────
const nodeVersion = "22";

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

// ─── Tasks ───────────────────────────────────────────────────────────────────
const ghTokenEnv = {
    name: "GH_TOKEN",
    valueFrom: { secretKeyRef: { name: "github-token", key: "token" } },
};

const setPendingStatus = new Task({
    name: "set-pending-status",
    params: [revisionParam, repoFullName],
    steps: [
        {
            name: "set-pending",
            image: "cgr.dev/chainguard/gh:latest",
            env: [ghTokenEnv],
            script: `#!/bin/sh
set -e
gh api "repos/$(params.repo-full-name)/statuses/$(params.revision)" \
  -f state=pending -f context=tektonic-ci -f description="Pipeline running"`,
        },
    ],
});

const gitClone = new Task({
    name: "git-clone",
    stepTemplate: { securityContext: RESTRICTED_STEP_SECURITY_CONTEXT },
    params: [urlParam, revisionParam],
    workspaces: [workspace],
    needs: [setPendingStatus],
    steps: [
        {
            name: "clone",
            image: "cgr.dev/chainguard/git:latest",
            workingDir: workspace.path,
            script: `#!/bin/sh
set -e
git clone -v ${urlParam} .
git config --global --add safe.directory ${workspace.path}
git checkout ${revisionParam}`,
        },
    ],
});

const npmTest = new Task({
    name: "test-npm",
    params: [buildPathParam],
    workspaces: [workspace],
    needs: [gitClone],
    steps: [
        {
            name: "test",
            image: `node:${nodeVersion}-alpine`,
            workingDir: `${workspace.path}/${buildPathParam}`,
            command: ["sh", "-c", "npm ci && npm test"],
        },
    ],
});

const npmBuild = new Task({
    name: "build-npm",
    params: [buildPathParam],
    workspaces: [workspace],
    needs: [gitClone],
    steps: [
        {
            name: "build",
            image: `node:${nodeVersion}-alpine`,
            workingDir: `${workspace.path}/${buildPathParam}`,
            command: ["sh", "-c", "npm ci && npm run build"],
        },
    ],
});

const trivyScan = new Task({
    name: "trivy-scan",
    params: [repoFullName, revisionParam],
    workspaces: [workspace],
    needs: [gitClone],
    steps: [
        {
            name: "scan",
            image: "aquasec/trivy:latest",
            workingDir: workspace.path,
            command: [
                "trivy",
                "fs",
                "--format",
                "sarif",
                "--output",
                `${workspace.path}/trivy.sarif`,
                ".",
            ],
        },
        {
            name: "upload-sarif",
            image: "cgr.dev/chainguard/wolfi-base:latest",
            workingDir: workspace.path,
            env: [ghTokenEnv],
            script: `#!/bin/sh
set -e
apk add --no-cache github-cli gzip
SARIF=$(gzip -c trivy.sarif | base64 -w0)
gh api "repos/$(params.repo-full-name)/code-scanning/sarifs" \
  -f commit_sha="$(params.revision)" -f ref=refs/heads/main -f sarif="$SARIF"`,
        },
    ],
});

// ─── Finally tasks ──────────────────────────────────────────────────────────
const setFinalStatus = new Task({
    name: "set-final-status",
    params: [revisionParam, repoFullName],
    steps: [
        {
            name: "set-status",
            image: "cgr.dev/chainguard/gh:latest",
            env: [ghTokenEnv],
            script: `#!/bin/sh
set -e
if [ "$(tasks.status)" = "Succeeded" ]; then
  STATE=success DESC="Pipeline succeeded"
else
  STATE=failure DESC="Pipeline failed"
fi
gh api "repos/$(params.repo-full-name)/statuses/$(params.revision)" \
  -f state="$STATE" -f context=tektonic-ci -f description="$DESC"`,
        },
    ],
});

// ─── Pipelines ───────────────────────────────────────────────────────────────
const pushPipeline = new Pipeline({
    name: "npm-push",
    triggers: [TRIGGER_EVENTS.PUSH],
    tasks: [npmTest, trivyScan],
    finallyTasks: [setFinalStatus],
});

const prPipeline = new Pipeline({
    name: "npm-pull-request",
    triggers: [TRIGGER_EVENTS.PULL_REQUEST],
    tasks: [npmTest, npmBuild, trivyScan],
    finallyTasks: [setFinalStatus],
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
});
