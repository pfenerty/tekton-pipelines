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

// ─── Tasks ───────────────────────────────────────────────────────────────────
const gitClone = new Task({
    name: "git-clone",
    stepTemplate: { securityContext: RESTRICTED_STEP_SECURITY_CONTEXT },
    params: [urlParam, revisionParam],
    workspaces: [workspace],
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

// ─── Pipelines ───────────────────────────────────────────────────────────────
const pushPipeline = new Pipeline({
    name: "npm-push",
    triggers: [TRIGGER_EVENTS.PUSH],
    tasks: [npmTest],
});

const prPipeline = new Pipeline({
    name: "npm-pull-request",
    triggers: [TRIGGER_EVENTS.PULL_REQUEST],
    tasks: [npmTest, npmBuild],
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
