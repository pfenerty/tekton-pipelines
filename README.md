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
  Param, Workspace, Task, Pipeline, TektonProject,
  TRIGGER_EVENTS, RESTRICTED_STEP_SECURITY_CONTEXT,
} from '@pfenerty/tektonic';

// Params interpolate into step scripts via template literals
const url = new Param({ name: 'url' });
const revision = new Param({ name: 'revision' });
const workspace = new Workspace({ name: 'workspace' });

const gitClone = new Task({
  name: 'git-clone',
  stepTemplate: { securityContext: RESTRICTED_STEP_SECURITY_CONTEXT },
  params: [url, revision],
  workspaces: [workspace],
  steps: [{
    name: 'clone',
    image: 'cgr.dev/chainguard/git:latest',
    workingDir: workspace.path,        // → $(workspaces.workspace.path)
    script: `#!/bin/sh
set -e
git clone -v ${url} .
git checkout ${revision}`,            // → $(params.url), $(params.revision)
  }],
});

const test = new Task({
  name: 'test',
  workspaces: [workspace],
  needs: [gitClone],                   // runs after git-clone
  steps: [{
    name: 'test',
    image: 'node:22-alpine',
    workingDir: workspace.path,
    command: ['sh', '-c', 'npm ci && npm test'],
  }],
});

const pushPipeline = new Pipeline({
  triggers: [TRIGGER_EVENTS.PUSH],
  tasks: [test],                       // git-clone auto-discovered via needs
});

new TektonProject({
  name: 'my-app',
  namespace: 'tekton-builds',
  pipelines: [pushPipeline],
  webhookSecretRef: { secretName: 'github-webhook-secret', secretKey: 'secret' },
});
// → writes YAML for Task, Pipeline, RBAC, EventListener, TriggerBinding/Template
```

## Key features

- **Template literal interpolation** — `${param}` and `${workspace.path}` produce Tekton expressions
- **Automatic dependency discovery** — `task.needs` defines the graph; pipelines walk it transitively
- **Param & workspace inference** — pipelines collect the union of all task params/workspaces automatically
- **Security defaults** — every step gets `drop: ALL` capabilities and seccomp `RuntimeDefault`
- **GitHub webhook triggers** — push, pull request, and tag triggers with CEL filtering, RBAC, and EventListener generation
- **Name prefixing** — isolate multiple projects in the same namespace

## Documentation

- [Getting started](docs/getting-started.md) — step-by-step tutorial
- [API reference](docs/api.md) — all classes, interfaces, and constants
- [Triggers guide](docs/triggers.md) — GitHub webhook setup and configuration

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
