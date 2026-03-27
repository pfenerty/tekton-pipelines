import {
    Param,
    Workspace,
    Task,
    GitPipeline,
    TektonProject,
    TRIGGER_EVENTS,
    GitHubStatusReporter,
} from "../src";

// ─── Images ──────────────────────────────────────────────────────────────────
const nodeImage = "node:22-alpine";
const syftImage = "ghcr.io/anchore/syft:v1.42.3";
const grypeImage = "ghcr.io/anchore/grype:v0.110.0";
const grantImage = "ghcr.io/anchore/grant:v0.6.4";

// ─── Params ──────────────────────────────────────────────────────────────────
const refParam = new Param({ name: "ref", type: "string" });

// ─── Status reporter ─────────────────────────────────────────────────────────
const statusReporter = new GitHubStatusReporter();

// ─── Cache workspaces ────────────────────────────────────────────────────────
// Grype's vulnerability database is cached across runs to avoid re-downloading it.
const grypeCache = new Workspace({ name: "grype-cache" });
const npmCache = new Workspace({ name: "npm-cache" });

// ─── Tasks ───────────────────────────────────────────────────────────────────
const npmTest = new Task({
    name: "test-npm",
    statusReporter,
    caches: [
        {
            key: ["package-lock.json"],
            paths: ["node_modules"],
            workspace: npmCache,
            image: nodeImage,
            compress: true,
            workingDir: "$(workspaces.workspace.path)",
        },
    ],
    steps: [
        {
            name: "test",
            image: nodeImage,
            workingDir: "$(workspaces.workspace.path)",
            env: [{ name: "npm_config_cache", value: npmCache.path }],
            script: `#!/bin/sh
[ ! -d node_modules ] && npm ci
npm test; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC`,
            onError: "continue",
        },
    ],
});

const npmBuild = new Task({
    name: "build-npm",
    needs: [npmTest],
    statusReporter,
    caches: [
        {
            key: ["package-lock.json"],
            paths: ["node_modules"],
            workspace: npmCache,
            image: nodeImage,
            compress: true,
            workingDir: "$(workspaces.workspace.path)",
        },
    ],
    steps: [
        {
            name: "build",
            image: nodeImage,
            workingDir: "$(workspaces.workspace.path)",
            env: [{ name: "npm_config_cache", value: npmCache.path }],
            script: `#!/bin/sh
[ ! -d node_modules ] && npm ci
npm run build; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC`,
            onError: "continue",
        },
    ],
});

const anchoreScann = new Task({
    name: "anchore-scan",
    params: [refParam],
    workspaces: [grypeCache],
    statusReporter,
    steps: [
        {
            name: "generate-sbom",
            image: syftImage,
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
            env: [
                {
                    name: "GRYPE_DB_CACHE_DIR",
                    value: grypeCache.path,
                },
            ],
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
const pushPipeline = new GitPipeline({
    name: "npm-push",
    triggers: [TRIGGER_EVENTS.PUSH],
    tasks: [npmTest, anchoreScann],
});

const prPipeline = new GitPipeline({
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
    // The nfs-client storage class uses NFS all_squash (anonuid=1024), which maps every
    // client UID/GID to 1024 on the NFS server. Overriding the pod-level security context
    // to match ensures the process UID equals the file owner UID, satisfying npm's cache
    // ownership check and granting write access to PVC-backed cache directories.
    defaultPodSecurityContext: {
        runAsUser: 1024,
        runAsGroup: 1024,
        fsGroup: 1024,
    },
    caches: [
        {
            workspace: grypeCache,
            storageSize: "2Gi",
        },
        {
            workspace: npmCache,
            storageSize: "2Gi",
        },
    ],
});
