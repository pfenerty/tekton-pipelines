import {
    Param,
    Workspace,
    Task,
    TaskStepSpec,
    Pipeline,
    TektonProject,
    TRIGGER_EVENTS,
    RESTRICTED_STEP_SECURITY_CONTEXT,
} from "../src";

// --- Images ---───────────────────────────────────────────────────────────────
const curlImage = "cgr.dev/chainguard/curl:latest-dev";
const gitImage = "cgr.dev/chainguard/git:latest";
const nodeImage = "node:22-alpine";
const trivyImage = "aquasec/trivy:latest";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ghTokenEnv = {
    name: "GITHUB_TOKEN",
    valueFrom: { secretKeyRef: { name: "github-token", key: "token" } },
};

function pendingStep(context: string): TaskStepSpec {
    return {
        name: "set-pending",
        image: curlImage,
        env: [ghTokenEnv],
        command: ["sh", "-c"],
        args: [
            `curl -fsS -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\\"state\\":\\"pending\\",\\"context\\":\\"${context}\\",\\"description\\":\\"Running\\"}" \
  "https://api.github.com/repos/$(params.repo-full-name)/statuses/$(params.revision)"`,
        ],
    };
}

function statusStep(context: string): TaskStepSpec {
    return {
        name: "report-status",
        image: curlImage,
        env: [ghTokenEnv],
        command: ["sh", "-c"],
        args: [
            `EXIT_CODE=$(cat /tekton/home/.exit-code)
if [ "$EXIT_CODE" -eq 0 ]; then STATE=success DESC=Passed; else STATE=failure DESC=Failed; fi
curl -fsS -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\\"state\\":\\"$STATE\\",\\"context\\":\\"${context}\\",\\"description\\":\\"$DESC\\"}" \
  "https://api.github.com/repos/$(params.repo-full-name)/statuses/$(params.revision)"`,
        ],
    };
}

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
git clone -v ${urlParam} .
git config --global --add safe.directory ${workspace.path}
git checkout ${revisionParam}`,
        },
    ],
});

const npmTest = new Task({
    name: "test-npm",
    params: [buildPathParam, repoFullName, revisionParam],
    workspaces: [workspace],
    needs: [gitClone],
    steps: [
        pendingStep("tektonic-ci/test"),
        {
            name: "test",
            image: nodeImage,
            workingDir: `${workspace.path}/${buildPathParam}`,
            command: ["sh", "-c"],
            args: ["npm ci && npm test; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC"],
            onError: "continue",
        },
        statusStep("tektonic-ci/test"),
    ],
});

const npmBuild = new Task({
    name: "build-npm",
    params: [buildPathParam, repoFullName, revisionParam],
    workspaces: [workspace],
    needs: [npmTest],
    steps: [
        pendingStep("tektonic-ci/build"),
        {
            name: "build",
            image: nodeImage,
            workingDir: `${workspace.path}/${buildPathParam}`,
            command: ["sh", "-c"],
            args: ["npm run build; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC"],
            onError: "continue",
        },
        statusStep("tektonic-ci/build"),
    ],
});

const trivyScan = new Task({
    name: "trivy-scan",
    params: [repoFullName, revisionParam],
    workspaces: [workspace],
    needs: [gitClone],
    steps: [
        pendingStep("tektonic-ci/scan"),
        {
            name: "scan",
            image: trivyImage,
            workingDir: workspace.path,
            command: ["sh", "-c"],
            args: [
                `trivy fs --format sarif --output ${workspace.path}/trivy.sarif .; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC`,
            ],
            onError: "continue",
        },
        {
            name: "upload-sarif",
            image: curlImage,
            workingDir: workspace.path,
            env: [ghTokenEnv],
            command: ["sh", "-c"],
            args: [
                `set -e
SARIF=$(gzip -c trivy.sarif | base64 -w0)
curl -fsS -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\\"commit_sha\\":\\"$(params.revision)\\",\\"ref\\":\\"refs/heads/main\\",\\"sarif\\":\\"$SARIF\\"}" \
  "https://api.github.com/repos/$(params.repo-full-name)/code-scanning/sarifs"`,
            ],
        },
        statusStep("tektonic-ci/scan"),
    ],
});

// ─── Pipelines ───────────────────────────────────────────────────────────────
const pushPipeline = new Pipeline({
    name: "npm-push",
    triggers: [TRIGGER_EVENTS.PUSH],
    tasks: [npmTest, trivyScan],
});

const prPipeline = new Pipeline({
    name: "npm-pull-request",
    triggers: [TRIGGER_EVENTS.PULL_REQUEST],
    tasks: [npmTest, npmBuild, trivyScan],
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
