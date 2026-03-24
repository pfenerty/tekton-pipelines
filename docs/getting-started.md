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
  Param, Workspace, Task, Pipeline, TektonProject,
  TRIGGER_EVENTS, RESTRICTED_STEP_SECURITY_CONTEXT,
} from '@pfenerty/tektonic';

const url = new Param({ name: 'url', type: 'string' });
const revision = new Param({ name: 'revision', type: 'string' });
const buildPath = new Param({ name: 'build-path', type: 'string', default: './' });

const workspace = new Workspace({ name: 'workspace' });
```

When used in template literals:
- `${url}` produces `$(params.url)`
- `${workspace.path}` produces `$(workspaces.workspace.path)`

## 3. Create tasks

Each `Task` declares its params, workspaces, steps, and dependencies (`needs`).

```typescript
const gitClone = new Task({
  name: 'git-clone',
  stepTemplate: { securityContext: RESTRICTED_STEP_SECURITY_CONTEXT },
  params: [url, revision],
  workspaces: [workspace],
  steps: [{
    name: 'clone',
    image: 'cgr.dev/chainguard/git:latest',
    workingDir: workspace.path,
    script: `#!/bin/sh
set -e
git clone -v ${url} .
git checkout ${revision}`,
  }],
});

const npmTest = new Task({
  name: 'test-npm',
  params: [buildPath],
  workspaces: [workspace],
  needs: [gitClone],       // ← dependency: runs after git-clone
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
  workspaces: [workspace],
  needs: [gitClone],       // ← also depends on git-clone (runs in parallel with test)
  steps: [{
    name: 'build',
    image: 'node:22-alpine',
    workingDir: `${workspace.path}/${buildPath}`,
    command: ['sh', '-c', 'npm ci && npm run build'],
  }],
});
```

The `needs` array forms a dependency graph. Pipelines automatically discover all transitive dependencies and set `runAfter` ordering — you only need to specify direct dependencies.

## 4. Compose pipelines

```typescript
const pushPipeline = new Pipeline({
  name: 'npm-push',
  triggers: [TRIGGER_EVENTS.PUSH],
  tasks: [npmTest],
  // git-clone is auto-discovered through npmTest.needs
});

const prPipeline = new Pipeline({
  name: 'npm-pull-request',
  triggers: [TRIGGER_EVENTS.PULL_REQUEST],
  tasks: [npmTest, npmBuild],
  // git-clone discovered once, shared between both tasks
});
```

Pipelines automatically:
- Walk `task.needs` to discover all transitive tasks
- Infer the union of all params across tasks
- Infer the union of all workspaces across tasks
- Topologically sort tasks for execution
- Validate there are no cycles or missing dependencies

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

## 7. (Optional) Add GitHub webhook triggers

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

See [`examples/self-ci.ts`](../examples/self-ci.ts) for a complete working example that this project uses for its own CI.
