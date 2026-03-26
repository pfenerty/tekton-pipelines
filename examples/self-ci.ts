import {
    Param,
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

// ─── Tasks ───────────────────────────────────────────────────────────────────
const npmTest = new Task({
    name: "test-npm",
    statusReporter,
    steps: [
        {
            name: "test",
            image: nodeImage,
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
    needs: [npmTest],
    statusReporter,
    steps: [
        {
            name: "build",
            image: nodeImage,
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
    params: [refParam],
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
});
