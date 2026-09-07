import {
    Param,
    Task,
    GitPipeline,
    TektonicProject,
    TRIGGER_EVENTS,
    GitHubStatusReporter,
    DEFAULT_BASE_IMAGE,
    gcs,
    sh,
} from "../src";

// ─── Images ──────────────────────────────────────────────────────────────────
const nodeImage = "ghcr.io/pfenerty/apko-cicd/nodejs:22";
const syftImage = "ghcr.io/pfenerty/apko-cicd/syft:1.42.3";
const grypeImage = "ghcr.io/pfenerty/apko-cicd/grype:0.110.0";

// ─── Params ──────────────────────────────────────────────────────────────────
// PAC binds `source-branch` to {{ source_branch }} — the normalized branch name.
const sourceBranchParam = new Param({ name: "source-branch", type: "string" });
// PAC binds `source-branch` to the pushed ref; for a tag push that is the tag name.
const tagNameParam = sourceBranchParam;

// ─── Status reporter ─────────────────────────────────────────────────────────
// Under PAC, reuse the git-auth token via the pod env (see podTemplateEnv below)
// instead of injecting a separate github-token secret per step.
const statusReporter = new GitHubStatusReporter({ skipTokenInjection: true });

// ─── Cache backend ──────────────────────────────────────────────────────────
// GCS bucket for caching build artifacts. Requires Workload Identity on GKE.
const gcsBucket = "tektonic-ci-cache";

// ─── Tasks ───────────────────────────────────────────────────────────────────
const npmTest = new Task({
    name: "test-npm",
    statusReporter,
    caches: [
        {
            name: "npm",
            key: ["package-lock.json"],
            paths: ["node_modules"],
            backend: gcs({ bucket: gcsBucket, prefix: "npm/" }),
            compress: true,
            workingDir: "$(workspaces.workspace.path)",
        },
    ],
    steps: [
        {
            name: "test",
            image: nodeImage,
            workingDir: "$(workspaces.workspace.path)",
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
            name: "npm",
            key: ["package-lock.json"],
            paths: ["node_modules"],
            backend: gcs({ bucket: gcsBucket, prefix: "npm/" }),
            compress: true,
            workingDir: "$(workspaces.workspace.path)",
        },
    ],
    steps: [
        {
            name: "build",
            image: nodeImage,
            workingDir: "$(workspaces.workspace.path)",
            script: `#!/bin/sh
[ ! -d node_modules ] && npm ci
npm run build; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC`,
            onError: "continue",
        },
    ],
});

const anchoreScann = new Task({
    name: "anchore-scan",
    params: [sourceBranchParam],
    statusReporter,
    caches: [
        {
            name: "grype-db",
            key: [],
            paths: ["grype-db"],
            backend: gcs({ bucket: gcsBucket, prefix: "grype/" }),
            compress: true,
            forceSave: true,
            maxEntries: 1,
            workingDir: "$(workspaces.workspace.path)",
        },
    ],
    steps: [
        {
            name: "generate-sbom",
            image: syftImage,
            script: `#!/usr/bin/env nu
def log [msg: string] {
  print $"[(date now | format date '%H:%M:%S')] generate-sbom: ($msg)"
}

log "generating SBOM from package-lock.json"
let start = (date now)

^syft file:package-lock.json -o cyclonedx-json=sbom.cyclonedx.json -o syft-table

let elapsed = ((date now) - $start | into int) / 1_000_000_000
log $"done in ($elapsed)s"

if ("sbom.cyclonedx.json" | path exists) {
  let size = (ls sbom.cyclonedx.json | get size.0)
  log $"sbom size: ($size)"
} else {
  log "warning: sbom.cyclonedx.json not found"
}`,
        },
        {
            name: "scan",
            image: grypeImage,
            env: [
                {
                    name: "GRYPE_DB_CACHE_DIR",
                    value: "$(workspaces.workspace.path)/grype-db",
                },
            ],
            script: `#!/usr/bin/env nu
def log [msg: string] {
  print $"[(date now | format date '%H:%M:%S')] grype-scan: ($msg)"
}

log "scanning sbom.cyclonedx.json for vulnerabilities"
let start = (date now)

# Run grype directly so stdout/stderr stream in real time.
# onError: continue prevents the step failure from stopping the pipeline;
# the exit code is captured by the upload-sarif step via /tekton/steps/step-scan/exitCode.
^grype -v sbom:./sbom.cyclonedx.json -o sarif=./scan.sarif

let elapsed = ((date now) - $start | into int) / 1_000_000_000
log $"done in ($elapsed)s"

if ("scan.sarif" | path exists) {
  let size = (ls scan.sarif | get size.0)
  log $"sarif size: ($size)"
}`,
            onError: "continue",
        },
        {
            name: "upload-sarif",
            image: DEFAULT_BASE_IMAGE,
            // GITHUB_TOKEN is provided at the PipelineRun pod level via podTemplateEnv
            // (PAC's {{ git_auth_secret }}) — see the TektonicProject config below.
            script: `#!/usr/bin/env nu
def log [msg: string] {
  print $"[(date now | format date '%H:%M:%S')] upload-sarif: ($msg)"
}

# Capture grype exit code for status reporting
let grype_ec = (try { open --raw /tekton/steps/step-scan/exitCode | str trim | into int } catch { 0 })
$grype_ec | into string | save -f /tekton/home/.exit-code
log $"grype exit-code: ($grype_ec)"

if not ("scan.sarif" | path exists) or (ls scan.sarif | get size.0) == 0B {
  log "no sarif to upload, skipping"
  exit 0
}

let ref_raw = "$(params.source-branch)"
let ref = if ($ref_raw | str starts-with "refs/") { $ref_raw } else { $"refs/heads/($ref_raw)" }
log $"ref: ($ref)"

# Base64-encode the gzipped SARIF
let sarif_b64 = (open --raw scan.sarif | ^gzip -c | encode base64)
log $"sarif payload: (($sarif_b64 | str length) / 1024 | math round)KB base64"

let url = "https://api.github.com/repos/$(params.repo-full-name)/code-scanning/sarifs"
let body = {
  commit_sha: "$(params.revision)",
  ref: $ref,
  sarif: $sarif_b64,
}

log $"POST ($url)"

try {
  http post $url $body -t application/json -H [
    Authorization $"token ($env.GITHUB_TOKEN)"
    Accept "application/vnd.github+json"
  ]
  log "uploaded"
} catch { |e|
  log $"upload failed: ($e.msg)"
}`,
            onError: "continue",
        },
    ],
});


// Publishing runs only on tag pushes (see releasePipeline below). The token comes from a
// Kubernetes Secret in the CI namespace — create it out of band with an npm automation token:
//   kubectl create secret generic npm-token -n tektonic-ci --from-literal=token=npm_xxx
const npmPublish = new Task({
    name: "publish-npm",
    needs: [npmBuild],
    params: [sourceBranchParam],
    statusReporter,
    steps: [
        {
            name: "publish",
            image: nodeImage,
            workingDir: "$(workspaces.workspace.path)",
            env: [
                {
                    name: "NPM_TOKEN",
                    valueFrom: { secretKeyRef: { name: "npm-token", key: "token" } },
                },
                // npm's user config normally lives in $HOME, which is read-only in the pod;
                // point it at the workspace so the auth line can be written at all.
                {
                    name: "NPM_CONFIG_USERCONFIG",
                    value: "$(workspaces.workspace.path)/.npmrc",
                },
            ],
            // POSIX sh: the publish is a handful of ordinary commands, and `set -e` plus a
            // natural exit is exactly what the exit-code contract wants (see docs/scripting.md).
            // Command substitution uses backticks, not `$(...)`, so it cannot collide with
            // Tekton's own `$(...)` interpolation — the same rule the git-clone step follows.
            script: sh`
                set -e
                VERSION=\`node -p "require('./package.json').version"\`
                TAG_REF="${tagNameParam}"
                TAG=\${TAG_REF#refs/tags/}
                echo "publish-npm: package version $VERSION, tag $TAG"

                # The tag must name the version being published, or a mistagged release would
                # quietly publish whatever happens to be in package.json.
                case "$TAG" in
                  "v$VERSION"|"$VERSION") ;;
                  *) echo "publish-npm: tag '$TAG' does not match package version '$VERSION'"; exit 1 ;;
                esac

                # Republishing an existing version is an npm error, and re-running a release
                # pipeline is routine — treat "already there" as success.
                if npm view "@pfenerty/tektonic@$VERSION" version >/dev/null 2>&1; then
                  echo "publish-npm: $VERSION is already on the registry, nothing to do"
                  exit 0
                fi

                if [ ! -d node_modules ]; then npm ci; fi
                npm run build
                printf '//registry.npmjs.org/:_authToken=%s\\n' "$NPM_TOKEN" > "$NPM_CONFIG_USERCONFIG"
                npm publish --access public
                rm -f "$NPM_CONFIG_USERCONFIG"
                echo "publish-npm: published $VERSION"
            `,
        },
    ],
});

// ─── Pipelines ───────────────────────────────────────────────────────────────
const pushPipeline = new GitPipeline({
    name: "npm-push",
    trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
    tasks: [npmTest, anchoreScann],
});

const prPipeline = new GitPipeline({
    name: "npm-pull-request",
    trigger: { rules: [{ on: TRIGGER_EVENTS.PULL_REQUEST }] },
    tasks: [npmTest, npmBuild, anchoreScann],
});

// Tag pushes publish to npmjs. Test and build run first (publish-npm needs them), so a tag on a
// broken commit fails before anything reaches the registry.
const releasePipeline = new GitPipeline({
    name: "npm-release",
    trigger: { rules: [{ on: TRIGGER_EVENTS.TAG }] },
    tasks: [npmPublish],
});

// ─── Synthesize ──────────────────────────────────────────────────────────────
// In-repo PAC PipelineRun templates under .tektonic/, read by the PAC operator.
// The PipelineRun ServiceAccount ("tekton-triggers") is expected to be pre-created
// and annotated for GKE Workload Identity (for GCS cache access) out of band.
new TektonicProject({
    name: "tektonic",
    namespace: "tektonic-ci",
    pipelines: [pushPipeline, prPipeline, releasePipeline],
    outdir: ".tektonic",
    workspaceStorageSize: "3Gi",
    repository: { url: "https://github.com/pfenerty/tektonic" },
    // Provide the GitHub token (for status reporting + SARIF upload) via PAC's git-auth
    // secret at the pod level, so every step sees GITHUB_TOKEN.
    podTemplateEnv: [
        {
            name: "GITHUB_TOKEN",
            valueFrom: {
                secretKeyRef: { name: "{{ git_auth_secret }}", key: "git-provider-token" },
            },
        },
    ],
});
