import {
    Param,
    Workspace,
    Task,
    Pipeline,
    TektonProject,
    TRIGGER_EVENTS,
    RESTRICTED_STEP_SECURITY_CONTEXT,
} from "../src";

// ---- Variables ──────────────────────────────────────────────────────────────
const golangVersion = "1.23.0";

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
git checkout ${revisionParam}`,
        },
    ],
});

const goTest = new Task({
    name: "test-go",
    params: [buildPathParam],
    workspaces: [workspace],
    needs: [gitClone],
    steps: [
        {
            name: "test",
            image: `golang:${golangVersion}-alpine`,
            workingDir: `${workspace.path}/${buildPathParam}`,
            command: ["go", "test", "./..."],
        },
    ],
});

const goBuild = new Task({
    name: "build-go",
    params: [buildPathParam],
    workspaces: [workspace],
    needs: [gitClone],
    steps: [
        {
            name: "build",
            image: `golang:${golangVersion}-alpine`,
            workingDir: `${workspace.path}/${buildPathParam}`,
            command: ["go", "build", "./..."],
        },
    ],
});

const sbom = new Task({
    name: "generate-sbom",
    params: [buildPathParam],
    workspaces: [workspace],
    needs: [gitClone],
    steps: [
        {
            name: "sbom",
            image: "anchore/syft:v1.11.0-debug",
            workingDir: `${workspace.path}/${buildPathParam}`,
            command: ["sh", "-c", "syft . -o cyclonedx-json > sbom.json"],
        },
    ],
});

const vulnScan = new Task({
    name: "vuln-scan",
    params: [buildPathParam],
    workspaces: [workspace],
    needs: [sbom],
    steps: [
        {
            name: "scan",
            image: "anchore/grype:v0.79.6-debug",
            workingDir: `${workspace.path}/${buildPathParam}`,
            command: ["sh", "-c", "grype sbom:sbom.json"],
        },
    ],
});

const lint = new Task({
    name: "lint-go",
    params: [buildPathParam],
    workspaces: [workspace],
    needs: [gitClone],
    steps: [
        {
            name: "lint",
            image: "golangci/golangci-lint:latest",
            workingDir: `${workspace.path}/${buildPathParam}`,
            command: ["golangci-lint", "run", "./..."],
        },
    ],
});

// ─── Pipelines ───────────────────────────────────────────────────────────────
const pushPipeline = new Pipeline({
    name: "go-push",
    triggers: [TRIGGER_EVENTS.PUSH],
    tasks: [goTest, goBuild, sbom, vulnScan],
});

const prPipeline = new Pipeline({
    name: "go-pull-request",
    triggers: [TRIGGER_EVENTS.PULL_REQUEST],
    tasks: [goTest, sbom, vulnScan],
});

const lintPipeline = new Pipeline({
    name: "go-lint",
    tasks: [lint],
});

// ─── Synthesize ──────────────────────────────────────────────────────────────
new TektonProject({
    name: "homelab",
    namespace: "tekton-builds",
    pipelines: [pushPipeline, prPipeline, lintPipeline],
    webhookSecretRef: {
        secretName: "github-webhook-secret",
        secretKey: "secret",
    },
});
