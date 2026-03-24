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
| `env` | `{ name: string; value: string }[]` | — | Environment variables |

#### `TaskOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | *required* | Task name in manifests |
| `params` | `Param[]` | `[]` | Parameters accepted by this task |
| `workspaces` | `Workspace[]` | `[]` | Workspaces required by this task |
| `steps` | `TaskStepSpec[]` | *required* | Ordered list of steps |
| `needs` | `Task[]` | `[]` | Dependency graph edges |
| `stepTemplate` | `Record<string, unknown>` | — | Override/extend step template |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `synth(scope, namespace, namePrefix?)` | `void` | Synthesizes the Task resource into a cdk8s scope |

---

### `Pipeline`

Composes tasks into a Tekton Pipeline. Automatically discovers transitive dependencies, infers params/workspaces, validates the graph, and topologically sorts tasks.

#### `PipelineOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | auto-generated | Pipeline name. Derived from trigger type when omitted |
| `triggers` | `TRIGGER_EVENTS[]` | `[]` | Events that start this pipeline |
| `tasks` | `Task[]` | *required* | Top-level tasks (dependencies auto-discovered) |
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

### `TektonProject`

Top-level orchestrator. Synthesizes all tasks, pipelines, and trigger infrastructure to YAML.

#### `TektonProjectOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | `''` | Prefix for all resource names |
| `namespace` | `string` | *required* | Kubernetes namespace |
| `pipelines` | `Pipeline[]` | *required* | Pipelines to synthesize |
| `serviceAccountName` | `string` | `'tekton-triggers'` | Trigger SA name |
| `workspaceStorageSize` | `string` | `'1Gi'` | PVC size |
| `webhookSecretRef` | `{ secretName: string; secretKey: string }` | — | Webhook secret |
| `outdir` | `string` | cdk8s default | Output directory |
| `urlParam` | `string` | `'url'` | Param name for repository URL |
| `revisionParam` | `string` | `'revision'` | Param name for git revision |

---

### `TRIGGER_EVENTS`

Enum of GitHub webhook event types.

| Member | Value | Description |
|--------|-------|-------------|
| `PUSH` | `'push'` | Branch pushes (excludes tags when tag pipeline exists) |
| `PULL_REQUEST` | `'pull_request'` | Pull request opened/synchronized |
| `TAG` | `'tag'` | Tag pushes (filtered via CEL on `refs/tags/`) |

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
|----------|------|-------------|
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
