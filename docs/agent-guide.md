# Tektonic Agent Guide

A complete reference for agents creating Tekton CI/CD pipelines with this library.

## Mental Model

- **`Param` / `Workspace`** are named handles. Use them in template literals (`${param}`, `${workspace.path}`) to produce Tekton interpolation expressions (`$(params.name)`, `$(workspaces.name.path)`).
- **`Task`** maps to one Tekton Task: a list of steps, optional params/workspaces, optional caches, and an optional status reporter.
- **`GitPipeline`** wires tasks together: it auto-creates a `git-clone` step, threads the shared workspace through every task, and walks the `needs` graph to set `runAfter`. `TRIGGER_EVENTS` controls which GitHub events fire it.
- **`TektonProject`** is the synthesizer. Calling `new TektonProject(...)` writes all Kubernetes manifests (Tasks, Pipeline, RBAC, EventListener, TriggerBindings/Templates, PVCs) to `outdir`.

## Installation

```bash
npm install @pfenerty/tektonic cdk8s constructs
```

Create a pipeline file (e.g. `ci/pipeline.ts`) and run it:

```bash
npx ts-node ci/pipeline.ts
# or add to package.json: "synth": "ts-node ci/pipeline.ts"
```

## Minimal Example

```typescript
import {
  Task,
  GitPipeline,
  TektonProject,
  TRIGGER_EVENTS,
} from '@pfenerty/tektonic';

// One task: run tests
const test = new Task({
  name: 'test',
  steps: [{
    name: 'test',
    image: 'node:22-alpine',
    // workingDir defaults to the shared workspace path
    workingDir: '$(workspaces.workspace.path)',
    script: '#!/bin/sh\nnpm ci && npm test',
  }],
});

// One pipeline: fire on push, run the test task
// GitPipeline auto-creates a git-clone step that runs first
const pipeline = new GitPipeline({
  name: 'push',
  triggers: [TRIGGER_EVENTS.PUSH],
  tasks: [test],
});

// Synthesize everything to YAML
new TektonProject({
  name: 'my-app',         // prefix for all resource names
  namespace: 'tekton-ci', // Kubernetes namespace
  pipelines: [pipeline],
  outdir: '.tekton',      // output directory
  webhookSecretRef: {     // Kubernetes Secret for GitHub webhook validation
    secretName: 'github-webhook-secret',
    secretKey: 'secret',
  },
});
```

## Param

```typescript
import { Param } from '@pfenerty/tektonic';

const ref = new Param({ name: 'ref', type: 'string' });

// Use in a step script via template literal:
script: `git checkout ${ref}`  // → "git checkout $(params.ref)"
```

**Options:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Parameter name in Tekton manifests |
| `type?` | `'string' \| 'array' \| 'object'` | Defaults to `'string'` |
| `description?` | `string` | Human-readable description |
| `default?` | `string \| string[]` | Default value when not supplied |
| `pipelineExpression?` | `string` | Override the default `$(params.name)` expression (e.g. `$(tasks.status)` for built-ins) |

Params declared on a task are automatically collected and surfaced at the pipeline level. You don't need to declare them on the pipeline.

## Workspace

```typescript
import { Workspace } from '@pfenerty/tektonic';

const ws = new Workspace({ name: 'source' });

workingDir: ws.path   // → "$(workspaces.source.path)"
script: `ls ${ws.path}`  // → "ls $(workspaces.source.path)"
```

**Options:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Workspace name in Tekton manifests |
| `description?` | `string` | Human-readable description |
| `optional?` | `boolean` | Defaults to `false` |

`GitPipeline` auto-creates a `workspace` workspace and mounts it on every task. You rarely need to declare workspaces explicitly unless adding a second one (e.g. a dedicated cache PVC).

## Task

```typescript
const task = new Task({
  name: 'build',
  params: [refParam],           // Params this task accepts
  workspaces: [extraWorkspace], // Additional workspaces (workspace is auto-added by GitPipeline)
  needs: [testTask],            // Tasks that must complete first
  statusReporter,               // Optional: report status to GitHub
  caches: [...],                // Optional: inject restore/save steps (see Caching)
  stepTemplate: {               // Override step defaults (merged with security context defaults)
    resources: { requests: { memory: '512Mi' } },
  },
  steps: [
    {
      name: 'build',
      image: 'golang:1.22-alpine',
      workingDir: '$(workspaces.workspace.path)',
      script: '#!/bin/sh\ngo build ./...',
      env: [
        { name: 'GOOS', value: 'linux' },
        // Secret reference:
        { name: 'TOKEN', valueFrom: { secretKeyRef: { name: 'my-secret', key: 'token' } } },
      ],
      onError: 'continue',       // 'continue' or 'stopAndFail' (default)
      computeResources: {
        requests: { cpu: '500m', memory: '1Gi' },
        limits: { memory: '2Gi' },
      },
    },
  ],
});
```

**Key behaviors:**
- Steps run in order. If a step fails and `onError` is not `'continue'`, the task stops.
- `needs` drives the pipeline dependency graph — tasks without `needs` run after git-clone.
- The status reporter appends a final reporting step automatically at synthesis time.

## GitPipeline

```typescript
import { GitPipeline, TRIGGER_EVENTS } from '@pfenerty/tektonic';

const pipeline = new GitPipeline({
  name: 'my-pipeline',
  triggers: [TRIGGER_EVENTS.PUSH, TRIGGER_EVENTS.PULL_REQUEST],
  tasks: [testTask, buildTask, scanTask],  // order doesn't matter; needs drives sequencing
  cloneImage: 'ghcr.io/myorg/git:latest', // optional: override default clone image
});
```

**Auto-injected params** (available in all task scripts):
- `$(params.url)` — repository clone URL
- `$(params.revision)` — commit SHA
- `$(params.repo-full-name)` — `owner/repo` (added when using `GitHubStatusReporter`)

**Trigger events:**

| Constant | GitHub event |
|----------|-------------|
| `TRIGGER_EVENTS.PUSH` | Push to any branch |
| `TRIGGER_EVENTS.PULL_REQUEST` | PR opened/synchronized |
| `TRIGGER_EVENTS.TAG` | Tag push |

## TektonProject

```typescript
new TektonProject({
  name: 'my-app',           // Resource name prefix
  namespace: 'tekton-ci',   // Kubernetes namespace
  pipelines: [pipeline],
  outdir: '.tekton',

  // GitHub webhook validation
  webhookSecretRef: {
    secretName: 'github-webhook-secret',
    secretKey: 'secret',
  },

  // Ephemeral workspace PVC (created fresh each PipelineRun)
  workspaceStorageSize: '3Gi',         // default: '1Gi'
  workspaceStorageClass: 'standard',   // omit to use cluster default
  workspaceAccessModes: ['ReadWriteOnce'], // default

  // Persistent cache PVCs (PVC backend only — not needed for GCS)
  caches: [
    { workspace: cacheWorkspace, storageSize: '5Gi', storageClassName: 'standard' },
  ],

  // Pipeline param names (match what you declare in your pipelines)
  urlParam: 'url',          // default
  revisionParam: 'revision', // default
  gitRefParam: 'ref',       // optional — add if tasks need the branch ref

  // GKE Workload Identity binding for the triggers ServiceAccount
  serviceAccountAnnotations: {
    'iam.gke.io/gcp-service-account': 'tekton-ci@my-project.iam.gserviceaccount.com',
  },

  // Security context overrides
  defaultPodSecurityContext: { fsGroup: 1000 },
  defaultStepSecurityContext: { runAsUser: 1000 },
});
```

**What gets generated** in `outdir`:
- One `Task` manifest per task
- One `Pipeline` manifest per `GitPipeline`
- `EventListener`, `TriggerBinding`, `TriggerTemplate` per trigger
- RBAC (`ServiceAccount`, `ClusterRole`, `ClusterRoleBinding`)
- `PersistentVolumeClaim` for each `caches` entry (not for GCS backends)
- `kustomization.yaml` listing all manifests

## Caching

Caches inject a restore step before your steps and a save step after. Hit/miss is hash-based (SHA256 of the key files), matching GitLab CI's `cache:` keyword behavior.

### GCS backend (GKE + Workload Identity)

No PVC needed. Archives stored in a GCS bucket. Requires Workload Identity on GKE.

```typescript
caches: [{
  name: 'npm',                          // used in step names: restore-npm-cache / save-npm-cache
  key: ['package-lock.json'],           // files whose content determines the cache key
  paths: ['node_modules'],              // directories to restore/save
  backend: { type: 'gcs', bucket: 'my-ci-cache', prefix: 'npm/' },
  compress: true,                       // zstd compression (recommended for GCS)
  workingDir: '$(workspaces.workspace.path)',
}]
// No CacheSpec entry needed in TektonProject
// Set serviceAccountAnnotations on TektonProject for Workload Identity
```

### PVC backend (homelab / NFS)

Archives stored on a PersistentVolumeClaim. Declare the workspace and register it in `TektonProject.caches`.

```typescript
const npmCache = new Workspace({ name: 'npm-cache' });

// In Task:
caches: [{
  name: 'npm',
  key: ['package-lock.json'],
  paths: ['node_modules'],
  workspace: npmCache,
  compress: true,
  workingDir: '$(workspaces.workspace.path)',
}]

// In TektonProject:
caches: [{ workspace: npmCache, storageSize: '5Gi' }]
```

### Cache options

| Field | Default | Description |
|-------|---------|-------------|
| `name` | required | Step name prefix (`restore-{name}-cache`) |
| `key` | required | Key files; `[]` = fixed hash (always hits after first run) |
| `paths` | required | Paths to cache relative to `workingDir` |
| `backend` | PVC | `{ type: 'gcs', bucket, prefix? }` for GCS |
| `workspace` | — | Required for PVC backend |
| `compress` | `false` | zstd compression into `.tar.zst` archive |
| `compressionLevel` | `1` | zstd level 1–19 |
| `multiThreadCompression` | auto | `true` for GCS, `false` for PVC |
| `maxEntries` | `3` | Max archives to keep; `0` disables eviction |
| `forceSave` | `false` | Always save even if archive exists (use for tool-managed DBs like grype) |
| `saveStrategy` | `'step'` | `'finally'` runs save in a separate pod after the build pod exits |
| `workingDir` | — | Paths are relative to this dir |

## GitHub Status Reporting

```typescript
import { GitHubStatusReporter } from '@pfenerty/tektonic';

const reporter = new GitHubStatusReporter();
// optional: new GitHubStatusReporter({ tokenSecretName: 'my-secret' })

const task = new Task({
  name: 'test',
  statusReporter: reporter,
  // statusContext: 'ci/test', // defaults to task name
  steps: [...],
});
```

The reporter appends a final step that calls the GitHub Commit Status API. It requires:
- A Kubernetes Secret named `github-token` with key `token` containing a GitHub token with `repo:status` scope
- `repo-full-name` and `revision` params — auto-injected by `GitHubStatusReporter` into any task that uses it

## Real-World Example

The following is the actual self-CI pipeline for this repository. It shows:
- Multiple tasks with GCS caching
- Task dependencies (`needs`)
- GitHub status reporting
- SARIF upload to GitHub Advanced Security
- Multiple pipelines (push vs. pull request) sharing tasks

```typescript
import {
    Param,
    Task,
    GitPipeline,
    TektonProject,
    TRIGGER_EVENTS,
    GitHubStatusReporter,
    DEFAULT_BASE_IMAGE,
} from '@pfenerty/tektonic';

const nodeImage = 'ghcr.io/pfenerty/apko-cicd/nodejs:22';
const syftImage = 'ghcr.io/pfenerty/apko-cicd/syft:1.42.3';
const grypeImage = 'ghcr.io/pfenerty/apko-cicd/grype:0.110.0';

const refParam = new Param({ name: 'ref', type: 'string' });
const statusReporter = new GitHubStatusReporter();
const gcsBucket = 'my-ci-cache';

const npmTest = new Task({
    name: 'test-npm',
    statusReporter,
    caches: [{
        name: 'npm',
        key: ['package-lock.json'],
        paths: ['node_modules'],
        backend: { type: 'gcs', bucket: gcsBucket, prefix: 'npm/' },
        compress: true,
        workingDir: '$(workspaces.workspace.path)',
    }],
    steps: [{
        name: 'test',
        image: nodeImage,
        workingDir: '$(workspaces.workspace.path)',
        // Write exit code to /tekton/home/.exit-code so the status reporter
        // can report the correct status even when onError: continue is set.
        script: `#!/bin/sh
[ ! -d node_modules ] && npm ci
npm test; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC`,
        onError: 'continue',
    }],
});

const npmBuild = new Task({
    name: 'build-npm',
    needs: [npmTest],  // runs after test
    statusReporter,
    caches: [{
        name: 'npm',
        key: ['package-lock.json'],
        paths: ['node_modules'],
        backend: { type: 'gcs', bucket: gcsBucket, prefix: 'npm/' },
        compress: true,
        workingDir: '$(workspaces.workspace.path)',
    }],
    steps: [{
        name: 'build',
        image: nodeImage,
        workingDir: '$(workspaces.workspace.path)',
        script: `#!/bin/sh
[ ! -d node_modules ] && npm ci
npm run build; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC`,
        onError: 'continue',
    }],
});

const anchoreScann = new Task({
    name: 'anchore-scan',
    params: [refParam],
    statusReporter,
    caches: [{
        name: 'grype-db',
        key: [],           // empty key = fixed hash = always hits after first run
        paths: ['grype-db'],
        backend: { type: 'gcs', bucket: gcsBucket, prefix: 'grype/' },
        compress: true,
        forceSave: true,   // grype updates the DB in-place; always save
        maxEntries: 1,
        workingDir: '$(workspaces.workspace.path)',
    }],
    steps: [
        {
            name: 'generate-sbom',
            image: syftImage,
            script: `#!/usr/bin/env nu
^syft file:package-lock.json -o cyclonedx-json=sbom.cyclonedx.json -o syft-table`,
        },
        {
            name: 'scan',
            image: grypeImage,
            env: [{ name: 'GRYPE_DB_CACHE_DIR', value: '$(workspaces.workspace.path)/grype-db' }],
            script: `#!/usr/bin/env nu
^grype -v sbom:./sbom.cyclonedx.json -o sarif=./scan.sarif`,
            onError: 'continue',
        },
        {
            name: 'upload-sarif',
            image: DEFAULT_BASE_IMAGE,
            env: [{ name: 'GITHUB_TOKEN', valueFrom: { secretKeyRef: { name: 'github-token', key: 'token' } } }],
            script: `#!/usr/bin/env nu
let grype_ec = (try { open --raw /tekton/steps/step-scan/exitCode | str trim | into int } catch { 0 })
$grype_ec | into string | save -f /tekton/home/.exit-code
# ... upload scan.sarif to GitHub Advanced Security API`,
            onError: 'continue',
        },
    ],
});

// Push pipeline: test + scan
const pushPipeline = new GitPipeline({
    name: 'npm-push',
    triggers: [TRIGGER_EVENTS.PUSH],
    tasks: [npmTest, anchoreScann],
});

// PR pipeline: test + build + scan (build only runs on PRs)
const prPipeline = new GitPipeline({
    name: 'npm-pull-request',
    triggers: [TRIGGER_EVENTS.PULL_REQUEST],
    tasks: [npmTest, npmBuild, anchoreScann],
});

new TektonProject({
    name: 'my-app',
    namespace: 'tekton-ci',
    pipelines: [pushPipeline, prPipeline],
    outdir: '.tekton',
    workspaceStorageSize: '3Gi',
    webhookSecretRef: { secretName: 'github-webhook-secret', secretKey: 'secret' },
    gitRefParam: 'ref',
    serviceAccountAnnotations: {
        'iam.gke.io/gcp-service-account': 'tekton-ci@my-project.iam.gserviceaccount.com',
    },
});
```

## Status Reporter Exit Code Convention

When using `GitHubStatusReporter` with `onError: 'continue'`, the reporter reads `/tekton/home/.exit-code` to determine success/failure. Write the actual exit code there before exiting:

```sh
my-command; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC
```

This lets the pipeline continue (for SARIF upload etc.) while still reporting the correct status.
