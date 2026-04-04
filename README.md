# @pfenerty/tektonic

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Define Tekton CI/CD pipelines as TypeScript code using [cdk8s](https://cdk8s.io/). Compose params, workspaces, tasks, and pipelines with full type safety, then synthesize to Kubernetes YAML — including GitHub webhook trigger infrastructure.

## Install

```bash
npm install @pfenerty/tektonic cdk8s constructs
```

## Quick example

```typescript
import {
  Workspace, Task, GitPipeline, TektonProject, TRIGGER_EVENTS,
} from '@pfenerty/tektonic';

const workspace = new Workspace({ name: 'workspace' });

const test = new Task({
  name: 'test',
  steps: [{
    name: 'test',
    image: 'node:22-alpine',
    command: ['sh', '-c', 'npm ci && npm test'],
    // workingDir defaults to $(workspaces.workspace.path) — set by GitPipeline
  }],
});

const pushPipeline = new GitPipeline({
  triggers: [TRIGGER_EVENTS.PUSH],
  workspace,
  tasks: [test],
  // git-clone is auto-created; test runs after it automatically
});

new TektonProject({
  name: 'my-app',
  namespace: 'tekton-builds',
  pipelines: [pushPipeline],
  webhookSecretRef: { secretName: 'github-webhook-secret', secretKey: 'secret' },
});
// → writes YAML for Tasks, Pipeline, RBAC, EventListener, TriggerBindings/Templates
```

## Key features

- **`GitPipeline`** — auto-creates a `git-clone` task and wires the shared workspace and dependencies for every task
- **Template literal interpolation** — `${param}` and `${workspace.path}` produce Tekton expressions
- **Automatic dependency discovery** — `task.needs` defines the graph; pipelines walk it transitively
- **Param & workspace inference** — pipelines collect the union of all task params/workspaces automatically
- **Security defaults** — every step gets `drop: ALL` capabilities and seccomp `RuntimeDefault`
- **GitHub status reporting** — report commit statuses back to GitHub via `GitHubStatusReporter`; reporter params are auto-injected into tasks
- **GitHub webhook triggers** — push, pull request, and tag triggers with CEL filtering, RBAC, and EventListener generation
- **Name prefixing** — isolate multiple projects in the same namespace

## Documentation

- [Agent guide](docs/agent-guide.md) — full API reference with examples

## Requirements

| Dependency | Version |
|-----------|---------|
| Node.js | >= 18 |
| cdk8s | >= 2.0 |
| constructs | >= 10.0 |
| Tekton Pipelines | >= v0.59 |
| Tekton Triggers | >= v0.26 |

## Development

```bash
flox activate -- npm install       # install dependencies
flox activate -- npm run build     # compile TypeScript → dist/
flox activate -- npm test          # run tests
flox activate -- npm run docs:api  # generate API docs with TypeDoc
```

## License

[Apache-2.0](LICENSE)
