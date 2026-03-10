# tekton-pipelines

Reusable Tekton Pipelines defined with [cdk8s](https://cdk8s.io/) (TypeScript),
published as an npm library.

Pipelines, tasks, and triggers are modelled as typed TypeScript constructs. Running
`make synth` produces plain Kubernetes YAML in `synth-output/` that can be applied with
`kubectl` or picked up by any GitOps tool.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| kubectl | any recent |
| Tekton Pipelines | ≥ v0.59 |
| Tekton Triggers | ≥ v0.26 |

## Installation

```bash
npm install @pfenerty/tekton-pipelines
```

Peer dependencies (`cdk8s` and `constructs`) must be installed in the consuming project:

```bash
npm install cdk8s constructs
```

## Quick start (local synthesis)

```bash
npm install        # install Node.js dependencies
make synth         # generate YAML → synth-output/
make diff          # dry-run against the cluster (requires kubectl)
make apply         # apply to the cluster
```

## Testing

```bash
npm test           # run the Vitest test suite (30 tests)
```

## Project layout

```
src/
  index.ts         Public API — re-exports all constructs, constants, and types
  lib/
    tasks/         Task constructs (TektonTaskConstruct + PipelineTask wrappers)
    pipelines/     Pre-built Pipeline constructs
    triggers/      GitHub TriggerBinding + TriggerTemplate pairs
    builder/       PipelineBuilder — fluent API for composing custom pipelines
  charts/
    tekton-infra.chart.ts   RBAC, ServiceAccount, EventListener (GitHub webhook)
examples/
  main.ts          Reference implementation — demonstrates pre-built and custom pipelines
synth-output/      Synthesized YAML (generated, not committed)
dist/              Compiled library output (generated, not committed)
```

## Usage

### Pre-built pipelines

Import and instantiate ready-made pipelines for common Go and OCI workflows:

```typescript
import { App, Chart } from 'cdk8s';
import {
  GoPushPipeline,
  GoPullRequestPipeline,
  TektonInfraChart,
} from '@pfenerty/tekton-pipelines';

const app = new App();
const NAMESPACE = 'tekton-builds';

const goPushChart = new Chart(app, 'pipeline-go-push');
new GoPushPipeline(goPushChart, 'pipeline', { namespace: NAMESPACE });

const goPrChart = new Chart(app, 'pipeline-go-pull-request');
new GoPullRequestPipeline(goPrChart, 'pipeline', { namespace: NAMESPACE });

new TektonInfraChart(app, 'tekton-infra', {
  namespace: NAMESPACE,
  pushPipelineRef: 'go-push',
  pullRequestPipelineRef: 'go-merge-request',
  appRoot: 'src',
  buildPath: 'cmd',
});

app.synth();
```

### Custom pipelines with PipelineBuilder

`PipelineBuilder` lets you compose your own pipeline from individual task constructs
with an explicit dependency graph. Tasks with overlapping dependencies run in parallel.

```typescript
import { App, Chart } from 'cdk8s';
import {
  PipelineBuilder,
  GitClonePipelineTask,
  GoTestPipelineTask,
  GenerateSbomPipelineTask,
  VulnScanPipelineTask,
  PARAM_GIT_URL,
  PARAM_GIT_REVISION,
  PARAM_PROJECT_NAME,
  WS_WORKSPACE,
} from '@pfenerty/tekton-pipelines';

const app = new App();
const chart = new Chart(app, 'pipeline-custom-go');

// Dependency graph:
//   clone ──┬── test
//           └── sbom ── vuln-scan
new PipelineBuilder()
  .addFirst('clone', () => new GitClonePipelineTask())
  .addTask('test', ([clone]) => new GoTestPipelineTask({ runAfter: clone }), ['clone'])
  .addTask('sbom', ([clone]) => new GenerateSbomPipelineTask({ runAfter: clone }), ['clone'])
  .addTask('vuln', ([sbom]) => new VulnScanPipelineTask({ runAfter: sbom }), ['sbom'])
  .build(chart, 'pipeline', {
    name: 'my-custom-go-pipeline',
    namespace: 'tekton-builds',
    params: [
      { name: PARAM_GIT_URL, type: 'string' },
      { name: PARAM_GIT_REVISION, type: 'string' },
      { name: PARAM_PROJECT_NAME, type: 'string' },
    ],
    workspaces: [{ name: WS_WORKSPACE }],
  });

app.synth();
```

**PipelineBuilder methods:**

| Method | Description |
|--------|-------------|
| `addFirst(key, factory)` | Register a task with no dependencies (runs first). |
| `addTask(key, factory, dependsOn)` | Register a task with explicit dependencies. Tasks sharing the same dependencies run in parallel. |
| `addAfterAll(key, factory)` | Register a task that depends on every previously registered task (simple linear append). |
| `build(scope, id, opts)` | Topologically sort tasks and emit the Tekton Pipeline ApiObject. |

## How to add a new Task

1. Create `src/lib/tasks/my-task.task.ts` extending `TektonTaskConstruct`.
2. Define a props interface extending `TektonTaskProps` with any task-specific configuration.
3. Export the new class from `src/index.ts`.
4. Run `make synth` to verify.

```typescript
// src/lib/tasks/my-task.task.ts
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { Construct } from 'constructs';

export class MyTask extends TektonTaskConstruct {
  constructor(scope: Construct, id: string, props: TektonTaskProps) {
    super(scope, id, props, {
      name: 'my-task',
      spec: { /* ... */ },
    });
  }
}
```

## How to add a new Pipeline

1. Create `src/lib/pipelines/my-pipeline.pipeline.ts`.
2. Reference task names via props (e.g. `testTaskName`) rather than hardcoding strings —
   this keeps task and pipeline constructs loosely coupled.
3. Export the new class and its props type from `src/index.ts`.

## How to add a new Trigger (event source)

Each trigger encapsulates its `TriggerBinding` and `TriggerTemplate` as a pair:

1. Create `src/lib/triggers/my-event.trigger.ts` extending `GitHubTriggerBase`.
2. Expose `bindingRef` and `templateRef` string properties.
3. In `TektonInfraChart`, instantiate your trigger and add an entry to the
   `EventListener`'s `triggers` array referencing those refs.

```typescript
// Inside TektonInfraChart constructor
const myTrigger = new MyEventTrigger(this, 'my-trigger', {
  namespace,
  pipelineRef: 'my-pipeline',
});

// Add to EventListener triggers array:
{
  bindings: [{ kind: 'TriggerBinding', ref: myTrigger.bindingRef }],
  interceptors: [ /* ... */ ],
  template: { ref: myTrigger.templateRef },
}
```

## Synthesized manifests

`make synth` writes one YAML file per `Chart` into `synth-output/`. When running the
reference implementation in `examples/main.ts`, the output includes:

| File | Contents |
|------|----------|
| `task-go-test.k8s.yaml` | `test-go` Task |
| `task-go-build.k8s.yaml` | `build-go` Task |
| `task-generate-sbom.k8s.yaml` | `generate-sbom` Task |
| `task-vuln-scan.k8s.yaml` | `vulnerability-scan` Task |
| `pipeline-go-push.k8s.yaml` | `go-push` Pipeline |
| `pipeline-go-pull-request.k8s.yaml` | `go-merge-request` Pipeline |
| `pipeline-container-image-build.k8s.yaml` | `container-image-build` Pipeline |
| `pipeline-oci-build.k8s.yaml` | `oci-build` Pipeline |
| `pipeline-custom-go.k8s.yaml` | Custom pipeline built with PipelineBuilder |
| `tekton-infra.k8s.yaml` | ServiceAccount, RBAC, TriggerBindings, TriggerTemplates, EventListener |

## External Tasks

The OCI pipelines reference Tasks that are not defined in this repo and must be
installed separately:

- `fix-file-perms` — workspace permission fix
- `ko-build` — builds images with [Ko](https://ko.build)
- `build-oci` — builds images with Buildah / Kaniko
- `vuln-scan` — OCI image vulnerability scan
- `cosign-sign-image` — signs images with [Cosign](https://docs.sigstore.dev)
