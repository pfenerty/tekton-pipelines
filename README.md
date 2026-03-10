# tekton-pipelines

Reusable Tekton Pipelines defined with [cdk8s](https://cdk8s.io/) (TypeScript).

Pipelines, tasks, and triggers are modelled as typed TypeScript constructs. Running
`make synth` produces plain Kubernetes YAML in `dist/` that can be applied with
`kubectl` or picked up by any GitOps tool.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| kubectl | any recent |
| Tekton Pipelines | ≥ v0.59 |
| Tekton Triggers | ≥ v0.26 |

## Quick start

```bash
npm install        # install Node.js dependencies
make synth         # generate YAML → dist/
make diff          # dry-run against the cluster (requires kubectl)
make apply         # apply to the cluster
```

## Project layout

```
src/
  lib/
    tasks/           Reusable Task constructs
    triggers/        Reusable TriggerBinding + TriggerTemplate pairs
    pipelines/       Reusable Pipeline constructs
  charts/
    go-pipelines.chart.ts    Go CI tasks + pipelines
    oci-pipelines.chart.ts   OCI image build pipelines
    tekton-infra.chart.ts    RBAC + EventListener (GitHub webhook)
  main.ts            App entry point — composes charts and calls app.synth()
dist/                Synthesized YAML (generated, not committed)
```

## How to add a new Task

1. Create `src/lib/tasks/my-task.task.ts` extending `Construct`.
2. Define a props interface (`MyTaskProps`) with `namespace` and any
   task-specific configuration.
3. Instantiate your task inside the appropriate chart (e.g. `GoPipelinesChart`).
4. Run `make synth` to verify.

```typescript
// src/lib/tasks/my-task.task.ts
import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';

export class MyTask extends Construct {
  public readonly taskName: string;
  constructor(scope: Construct, id: string, props: { namespace: string }) {
    super(scope, id);
    this.taskName = 'my-task';
    new ApiObject(this, 'resource', {
      apiVersion: 'tekton.dev/v1',
      kind: 'Task',
      metadata: { name: this.taskName, namespace: props.namespace },
      spec: { /* ... */ },
    });
  }
}
```

## How to add a new Pipeline

1. Create `src/lib/pipelines/my-pipeline.pipeline.ts`.
2. Reference task names via props (e.g. `testTaskName`) rather than
   hardcoding strings — this keeps task and pipeline constructs loosely coupled.
3. Wire it into a chart in `src/charts/`.

## How to add a new Trigger (event source)

Each trigger encapsulates its `TriggerBinding` and `TriggerTemplate` as a pair:

1. Create `src/lib/triggers/my-event.trigger.ts` extending `Construct`.
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

`make synth` produces three files in `dist/`:

| File | Contents |
|------|----------|
| `go-pipelines.k8s.yaml` | test-go, build-go, generate-sbom, vulnerability-scan Tasks; go-push and go-merge-request Pipelines |
| `oci-pipelines.k8s.yaml` | container-image-build and oci-build Pipelines (reference external Tasks) |
| `tekton-infra.k8s.yaml` | ServiceAccount, RBAC, TriggerBindings, TriggerTemplates, EventListener |

## External Tasks

The OCI pipelines reference Tasks that are not defined in this repo and must be
installed separately:

- `fix-file-perms` — workspace permission fix
- `ko-build` — builds images with [Ko](https://ko.build)
- `build-oci` — builds images with Buildah / Kaniko
- `vuln-scan` — OCI image vulnerability scan
- `cosign-sign-image` — signs images with [Cosign](https://docs.sigstore.dev)
