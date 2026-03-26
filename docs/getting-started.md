# Getting started

This guide walks through building a complete Tekton CI pipeline using `@pfenerty/tektonic`. By the end you'll have tasks, a pipeline, GitHub webhook triggers, and synthesized YAML ready to apply to your cluster.

## Prerequisites

- Node.js >= 18
- A Kubernetes cluster with [Tekton Pipelines](https://tekton.dev/docs/installation/pipelines/) >= v0.59 and [Tekton Triggers](https://tekton.dev/docs/installation/triggers/) >= v0.26 installed

## 1. Install dependencies

```bash
npm install @pfenerty/tektonic cdk8s constructs
npm install -D typescript ts-node @types/node
```

## 2. Define params and workspaces

Params and workspaces are the data-passing primitives in Tekton. Create them as plain objects — they interpolate directly into step scripts via JavaScript template literals.

```typescript
import {
  Param, Workspace, Task, GitPipeline, TektonProject, TRIGGER_EVENTS,
} from '@pfenerty/tektonic';

const buildPath = new Param({ name: 'build-path', type: 'string', default: './' });
const workspace = new Workspace({ name: 'workspace' });
```

When used in template literals:
- `${buildPath}` produces `$(params.build-path)`
- `${workspace.path}` produces `$(workspaces.workspace.path)`

`url` and `revision` params are created and managed automatically by `GitPipeline` — you don't need to declare them.

## 3. Create tasks

Each `Task` declares its params, steps, and any direct dependencies (`needs`). When using `GitPipeline`, you don't need to declare the shared workspace or the `git-clone` dependency — both are injected automatically.

```typescript
const npmTest = new Task({
  name: 'test-npm',
  params: [buildPath],
  steps: [{
    name: 'test',
    image: 'node:22-alpine',
    workingDir: `${workspace.path}/${buildPath}`,
    command: ['sh', '-c', 'npm ci && npm test'],
  }],
});

const npmBuild = new Task({
  name: 'build-npm',
  params: [buildPath],
  needs: [npmTest],   // ← inter-task dependency; git-clone is handled by GitPipeline
  steps: [{
    name: 'build',
    image: 'node:22-alpine',
    workingDir: `${workspace.path}/${buildPath}`,
    command: ['sh', '-c', 'npm ci && npm run build'],
  }],
});
```

The `needs` array forms a dependency graph between your tasks. Pipelines automatically discover all transitive dependencies and set `runAfter` ordering — you only need to specify direct dependencies between your own tasks.

## 4. Compose pipelines

Use `GitPipeline` instead of `Pipeline`. It automatically creates a `git-clone` task, injects the shared workspace into every task, and wires `git-clone` as a dependency for tasks with no other explicit dependencies.

Pass `workspace` explicitly so your task steps can reference `workspace.path`.

```typescript
const pushPipeline = new GitPipeline({
  name: 'npm-push',
  workspace,
  triggers: [TRIGGER_EVENTS.PUSH],
  tasks: [npmTest],
  // Execution order: git-clone → test-npm
});

const prPipeline = new GitPipeline({
  name: 'npm-pull-request',
  workspace,
  triggers: [TRIGGER_EVENTS.PULL_REQUEST],
  tasks: [npmTest, npmBuild],
  // Execution order: git-clone → test-npm → build-npm
});
```

`GitPipeline` also exposes `pipeline.workspace` and `pipeline.cloneTask` if you need to reference them.

## 5. Synthesize with TektonProject

```typescript
new TektonProject({
  name: 'tekton-pipelines',
  namespace: 'tekton-builds',
  pipelines: [pushPipeline, prPipeline],
  outdir: 'ci-pipeline',
  webhookSecretRef: {
    secretName: 'github-webhook-secret',
    secretKey: 'secret',
  },
});
```

This generates YAML files in `ci-pipeline/` containing:
- A Tekton `Task` resource for each unique task (git-clone, test-npm, build-npm)
- A Tekton `Pipeline` resource for each pipeline
- Trigger infrastructure: ServiceAccount, RBAC, TriggerBindings, TriggerTemplates, EventListener

## 6. Apply to cluster

```bash
# Synthesize
npx ts-node pipeline.ts

# Apply all generated YAML
kubectl apply -f ci-pipeline/
```

## 7. (Optional) Add GitHub status reporting

Report commit statuses back to GitHub so pull requests show CI results inline. Create a `GitHubStatusReporter` and attach it to any task that should report:

```typescript
import { GitHubStatusReporter } from '@pfenerty/tektonic';

const statusReporter = new GitHubStatusReporter();
// Requires a 'github-token' Secret in the namespace with key 'token'

const npmTest = new Task({
  name: 'test-npm',
  params: [buildPath],
  statusContext: 'ci/test',   // ← label shown in the GitHub Checks UI
  statusReporter,             // ← auto-appends a status-reporting step
  steps: [{
    name: 'test',
    image: 'node:22-alpine',
    workingDir: `${workspace.path}/${buildPath}`,
    command: ['sh', '-c'],
    // capture exit code so the reporter can read it
    args: ['npm ci && npm test; EC=$?; echo $EC > /tekton/home/.exit-code; exit $EC'],
    onError: 'continue',      // ← let the reporter step run even on failure
  }],
});
```

Key points:
- `statusContext` defaults to the task `name` if omitted
- The reporter's required params (`revision`, `repo-full-name`) are **auto-injected** into the task — no need to add them to `params`
- Steps that report status must write their exit code to `/tekton/home/.exit-code` and use `onError: 'continue'` so the reporting step always runs
- Create the token secret before running pipelines:
  ```bash
  kubectl create secret generic github-token \
    --namespace=tekton-builds \
    --from-literal=token=YOUR_GITHUB_TOKEN
  ```

## 8. (Optional) Add GitHub webhook triggers

If any pipeline has `triggers` set, `TektonProject` automatically generates the trigger infrastructure. To complete the webhook setup:

1. **Create the webhook secret** in your cluster:
   ```bash
   kubectl create secret generic github-webhook-secret \
     --namespace=tekton-builds \
     --from-literal=secret=YOUR_WEBHOOK_SECRET
   ```

2. **Expose the EventListener** (e.g. via Ingress or port-forward):
   ```bash
   kubectl port-forward -n tekton-builds svc/el-github-listener 8080
   ```

3. **Configure the webhook** in your GitHub repository settings:
   - Payload URL: your EventListener endpoint
   - Content type: `application/json`
   - Secret: the same value as `YOUR_WEBHOOK_SECRET`
   - Events: select "Pushes" and "Pull requests"

See the [triggers guide](triggers.md) for more details on webhook configuration and customization.

## Full example

See [`examples/self-ci.ts`](../examples/self-ci.ts) for a complete working example that this project uses for its own CI, including status reporting and security scanning.
