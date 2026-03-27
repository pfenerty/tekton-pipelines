# API reference

Complete reference for all public classes, interfaces, and constants exported by `@pfenerty/tektonic`.

## Core

### `Param`

A Tekton pipeline/task parameter. Implements `toString()` so template literal interpolation produces Tekton expressions.

```typescript
const url = new Param({ name: 'url' });
`git clone ${url}` // → "git clone $(params.url)"
```

#### `ParamOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | *required* | Parameter name in Tekton manifests |
| `description` | `string` | — | Human-readable description |
| `type` | `'string' \| 'array' \| 'object'` | `'string'` | Tekton param type |
| `default` | `string \| string[]` | — | Default value when not supplied at runtime |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `toString()` | `string` | Returns `$(params.<name>)` |
| `toSpec()` | `Record<string, unknown>` | Serializes to Tekton spec format |

---

### `Workspace`

A Tekton workspace declaration. The `path` and `bound` getters produce interpolation expressions.

```typescript
const ws = new Workspace({ name: 'source' });
ws.path  // → "$(workspaces.source.path)"
ws.bound // → "$(workspaces.source.bound)"
```

#### `WorkspaceOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | *required* | Workspace name in Tekton manifests |
| `description` | `string` | — | Human-readable description |
| `optional` | `boolean` | `false` | Whether the workspace is optional |

#### Properties & methods

| Member | Type | Description |
|--------|------|-------------|
| `path` | `string` (getter) | `$(workspaces.<name>.path)` |
| `bound` | `string` (getter) | `$(workspaces.<name>.bound)` |
| `toSpec()` | `Record<string, unknown>` | Serializes to Tekton spec format |

---

### `Task`

A Tekton Task definition. Declares params, workspaces, steps, and dependencies.

All steps inherit a secure-by-default `stepTemplate` that drops all capabilities and enables seccomp. Override via the `stepTemplate` option.

#### `TaskStepSpec`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | *required* | Step name (unique within task) |
| `image` | `string` | *required* | Container image |
| `command` | `string[]` | — | Entrypoint override |
| `args` | `string[]` | — | Arguments to entrypoint |
| `script` | `string` | — | Inline script |
| `workingDir` | `string` | — | Working directory |
| `env` | `{ name: string; value?: string; valueFrom?: { secretKeyRef: { name: string; key: string } } }[]` | — | Environment variables (supports literal values and Secret references) |
| `onError` | `'continue' \| 'stopAndFail'` | `'stopAndFail'` | Whether subsequent steps run when this step fails. Use `'continue'` to let a reporter step always execute. |
| `computeResources` | `{ requests?: { cpu?: string; memory?: string }; limits?: { cpu?: string; memory?: string } }` | — | Per-step CPU/memory override. Overrides the `stepTemplate` defaults. |

#### `TaskOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | *required* | Task name in manifests |
| `params` | `Param[]` | `[]` | Parameters accepted by this task. Reporter params are auto-merged — see `statusReporter`. |
| `workspaces` | `Workspace[]` | `[]` | Workspaces required by this task |
| `steps` | `TaskStepSpec[]` | *required* | Ordered list of steps |
| `needs` | `Task[]` | `[]` | Dependency graph edges |
| `stepTemplate` | `Record<string, unknown>` | — | Override/extend step template |
| `statusContext` | `string` | task `name` | Context string reported to the external status system (e.g. `"ci/test"`). Requires `statusReporter`. |
| `statusReporter` | `StatusReporter` | — | When set, automatically appends a final status-reporting step and merges the reporter's `requiredParams` into this task's params. |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `synth(scope, namespace, namePrefix?)` | `void` | Synthesizes the Task resource into a cdk8s scope |

---

### `Pipeline`

Composes tasks into a Tekton Pipeline. Automatically discovers transitive dependencies, infers params/workspaces, validates the graph, and topologically sorts tasks.

For pipelines that clone a git repository, prefer [`GitPipeline`](#gitpipeline).

#### `PipelineOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | auto-generated | Pipeline name. Derived from trigger type when omitted |
| `triggers` | `TRIGGER_EVENTS[]` | `[]` | Events that start this pipeline |
| `tasks` | `Task[]` | *required* | Top-level tasks (dependencies auto-discovered) |
| `finallyTasks` | `Task[]` | `[]` | Tasks that run unconditionally after all regular tasks complete or fail |
| `params` | `Param[]` | `[]` | Additional pipeline-level params |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Resolved pipeline name |
| `triggers` | `TRIGGER_EVENTS[]` | Associated trigger events |
| `tasks` | `Task[]` | Top-level tasks as provided |
| `allTasks` | `Task[]` | All tasks including transitive dependencies |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `inferParams()` | `Record<string, unknown>[]` | De-duplicated union of all task params plus extra params |
| `inferWorkspaces()` | `Record<string, unknown>[]` | De-duplicated union of all task workspaces |

---

### `GitPipeline`

Extends `Pipeline` with automatic git-clone setup. Creates a `git-clone` task and shared workspace, then wires both into every task in the pipeline:

- The workspace is added to every task's `workspaces` (idempotent — safe to share task instances across multiple `GitPipeline`s)
- `workingDir: $(workspaces.<name>.path)` is injected into every task's `stepTemplate` so steps run in the cloned repo root by default — individual steps can still override `workingDir` explicitly
- Tasks with no explicit `needs` get `runAfter: git-clone` injected at spec-generation time, without mutating `task.needs`

```typescript
const workspace = new Workspace({ name: 'workspace' });

const test = new Task({ name: 'test', steps: [...] });
const build = new Task({ name: 'build', needs: [test], steps: [...] });

const pipeline = new GitPipeline({
  workspace,
  triggers: [TRIGGER_EVENTS.PUSH],
  tasks: [test, build],
  // Execution order: git-clone → test → build
});
```

#### `GitPipelineOptions`

Extends all [`PipelineOptions`](#pipelineoptions) with:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `workspace` | `Workspace` | `new Workspace({ name: 'workspace' })` | Shared workspace mounted by all tasks |
| `cloneImage` | `string` | `'cgr.dev/chainguard/git:latest'` | Container image for the git clone step |

#### Additional properties

| Property | Type | Description |
|----------|------|-------------|
| `workspace` | `Workspace` | The shared workspace |
| `cloneTask` | `Task` | The auto-generated `git-clone` task |

---

### `TektonProject`

Top-level orchestrator. Synthesizes all tasks, pipelines, and trigger infrastructure to YAML.

#### `TektonProjectOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | `''` | Prefix for all resource names |
| `namespace` | `string` | *required* | Kubernetes namespace |
| `pipelines` | `Pipeline[]` | *required* | Pipelines to synthesize |
| `serviceAccountName` | `string` | `'tekton-triggers'` | Trigger SA name |
| `workspaceStorageSize` | `string` | `'1Gi'` | Ephemeral workspace PVC size per PipelineRun |
| `caches` | `CacheSpec[]` | `[]` | Persistent cache volumes to provision and bind in every PipelineRun |
| `webhookSecretRef` | `{ secretName: string; secretKey: string }` | — | Webhook secret |
| `outdir` | `string` | cdk8s default | Output directory |
| `urlParam` | `string` | `'url'` | Param name for repository URL |
| `revisionParam` | `string` | `'revision'` | Param name for git revision |
| `gitRefParam` | `string` | — | Param name for the git ref string (branch or tag ref, e.g. `refs/heads/main`). When set, the trigger infrastructure passes the ref to each PipelineRun. |

#### `CacheSpec`

Declares a persistent cache workspace. `TektonProject` generates a `PersistentVolumeClaim` manifest for the cache and binds it in every PipelineRun.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `workspace` | `Workspace` | *required* | Workspace to bind as a persistent volume |
| `storageSize` | `string` | `'1Gi'` | PVC storage capacity |
| `claimName` | `string` | `${name}-${workspace.name}` | PVC resource name; defaults to project name prefix + workspace name |
| `storageClassName` | `string` | — | StorageClass; omitted to use cluster default |

```typescript
const grypeCache = new Workspace({ name: 'grype-cache' });

const scanTask = new Task({
  name: 'scan',
  workspaces: [grypeCache],
  steps: [{
    name: 'scan',
    image: 'ghcr.io/anchore/grype:latest',
    env: [{ name: 'GRYPE_DB_CACHE_DIR', value: grypeCache.path }],
    command: ['/grype', 'sbom:./sbom.json'],
  }],
});

new TektonProject({
  name: 'my-app',
  namespace: 'ci',
  pipelines: [...],
  caches: [{ workspace: grypeCache, storageSize: '2Gi' }],
});
// → generates a PersistentVolumeClaim 'my-app-grype-cache' and binds it in every PipelineRun
```

---

### `TRIGGER_EVENTS`

Enum of GitHub webhook event types.

| Member | Value | Description |
|--------|-------|-------------|
| `PUSH` | `'push'` | Branch pushes (excludes tags when tag pipeline exists) |
| `PULL_REQUEST` | `'pull_request'` | Pull request opened/synchronized |
| `TAG` | `'tag'` | Tag pushes (filtered via CEL on `refs/tags/`) |

---

## Status reporting

### `StatusReporter`

Provider-agnostic interface for reporting pipeline task statuses to an external system.

| Member | Description |
|--------|-------------|
| `createPendingTask(contexts: string[])` | Returns a `Task` that marks all given context strings as "pending" before any other task runs |
| `finalStep(context: string)` | Returns a `TaskStepSpec` that reads `/tekton/home/.exit-code` and reports success or failure for the given context |
| `requiredParams` | `Param[]` — params this reporter needs (e.g. repo name, revision). Automatically merged into the `params` of any `Task` that uses this reporter. |

### `GitHubStatusReporter`

Reports task statuses to the [GitHub Commit Status API](https://docs.github.com/en/rest/commits/statuses). Zero-config with sensible defaults.

```typescript
const reporter = new GitHubStatusReporter();
// Requires a 'github-token' Secret in the namespace with key 'token'
```

Attach to a task to have it report its status to GitHub:

```typescript
const test = new Task({
  name: 'test',
  statusContext: 'ci/test',   // label shown on the PR; defaults to task name
  statusReporter: reporter,
  steps: [{
    name: 'run',
    image: 'node:22-alpine',
    command: ['sh', '-c'],
    args: ['npm test; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC'],
    onError: 'continue',
  }],
});
```

#### `GitHubStatusReporterOptions`

All options are optional.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `image` | `string` | `'cgr.dev/chainguard/curl:latest-dev'` | Image used for status-reporting steps (needs `curl`) |
| `tokenSecretName` | `string` | `'github-token'` | Name of the Kubernetes Secret containing the GitHub token at key `token` |
| `repoFullNameParam` | `Param` | `new Param({ name: 'repo-full-name' })` | Param supplying the `owner/repo` value |
| `revisionParam` | `Param` | `new Param({ name: 'revision' })` | Param supplying the commit SHA |

> **Note:** The `repoFullNameParam` and `revisionParam` are automatically injected into any task that uses this reporter — you don't need to add them to the task's `params`.

---

## Triggers

### `GitHubTriggerBase`

Abstract base class for GitHub webhook triggers. Generates a TriggerBinding + TriggerTemplate pair.

#### `GitHubTriggerBaseProps`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `namespace` | `string` | *required* | Namespace for trigger resources |
| `pipelineRef` | `string` | *required* | Pipeline name to reference |
| `workspaceStorageSize` | `string` | `'1Gi'` | PVC size |
| `serviceAccountName` | `string` | `'tekton-triggers'` | SA for PipelineRun |
| `namePrefix` | `string` | — | Resource name prefix |
| `urlParam` | `string` | `'url'` | Pipeline param for repo URL |
| `revisionParam` | `string` | `'revision'` | Pipeline param for git revision |

#### `GitHubTriggerConfig`

| Property | Type | Description |
|----------|------|-------------|
| `bindingName` | `string` | TriggerBinding resource name |
| `templateName` | `string` | TriggerTemplate resource name |
| `pipelineRunGenerateName` | `string` | `generateName` prefix for PipelineRuns |
| `gitRevisionValue` | `string` | Expression extracting revision from webhook payload |

#### Properties

| Property | Type | Description |
|--------|------|-------------|
| `bindingRef` | `string` | Fully-qualified TriggerBinding name |
| `templateRef` | `string` | Fully-qualified TriggerTemplate name |

### `GitHubPushTrigger`

Trigger for `push` events. Extracts revision from `body.head_commit.id`.

### `GitHubPullRequestTrigger`

Trigger for `pull_request` events. Extracts revision from `body.pull_request.head.sha`.

### `GitHubTagTrigger`

Trigger for tag push events. Extracts revision from `body.ref`.

---

## Infrastructure

### `TektonInfraChart`

cdk8s Chart that generates shared trigger infrastructure: ServiceAccount, RBAC, triggers, and EventListener.

#### `TektonInfraChartProps`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `namespace` | `string` | *required* | Namespace for infrastructure resources |
| `pushPipelineRef` | `string` | `'push-pipeline'` | Pipeline for push events |
| `pullRequestPipelineRef` | `string` | `'pull-request-pipeline'` | Pipeline for PR events |
| `tagPipelineRef` | `string` | — | Pipeline for tag events (enables tag trigger) |
| `namePrefix` | `string` | — | Resource name prefix |
| `webhookSecretRef` | `{ secretName: string; secretKey: string }` | — | Webhook secret |
| `urlParam` | `string` | `'url'` | Param name for repo URL |
| `revisionParam` | `string` | `'revision'` | Param name for git revision |

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TEKTON_API_V1` | `'tekton.dev/v1'` | Tekton Pipelines API version |
| `TRIGGERS_API` | `'triggers.tekton.dev/v1beta1'` | Tekton Triggers API version |
| `PIPELINE_RUN_API` | `'tekton.dev/v1'` | PipelineRun API version |
| `DEFAULT_SERVICE_ACCOUNT` | `'tekton-triggers'` | Default trigger SA name |
| `DEFAULT_WORKSPACE_STORAGE` | `'1Gi'` | Default PVC size |
| `GITHUB_REPO_URL` | `'https://github.com/$(body.repository.full_name)'` | Repo URL expression |
| `DEFAULT_STEP_SECURITY_CONTEXT` | `{ allowPrivilegeEscalation: false, ... }` | Default step security context |
| `RESTRICTED_STEP_SECURITY_CONTEXT` | `{ ..., runAsNonRoot: true }` | Stricter security context with `runAsNonRoot` |
| `DEFAULT_STEP_RESOURCES` | `{ requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '1', memory: '512Mi' } }` | Default step resource requests and limits |
