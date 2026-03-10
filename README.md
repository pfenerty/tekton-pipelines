# @pfenerty/tekton-pipelines

TypeScript [cdk8s](https://cdk8s.io/) library for composing Tekton pipelines. Define pipelines as typed constructs; synthesize to Kubernetes YAML.

```bash
npm install @pfenerty/tekton-pipelines cdk8s constructs
```

## Quick start

**1. Create a CDK8s app** (`main.ts`):

```typescript
import { App, Chart } from 'cdk8s';
import {
  GoTestTask,
  GoPushPipeline,
  GoPullRequestPipeline,
  TektonInfraChart,
} from '@pfenerty/tekton-pipelines';

const app = new App();
const ns = 'tekton-builds';

// Task definitions
new GoTestTask(new Chart(app, 'task-go-test'), 'task', { namespace: ns });

// Pipelines
new GoPushPipeline(new Chart(app, 'pipeline-push'), 'pipeline', { namespace: ns });
new GoPullRequestPipeline(new Chart(app, 'pipeline-pr'), 'pipeline', { namespace: ns });

// GitHub webhook infrastructure (ServiceAccount, RBAC, EventListener)
new TektonInfraChart(app, 'tekton-infra', {
  namespace: ns,
  pushPipelineRef: 'go-push',
  pullRequestPipelineRef: 'go-merge-request',
  appRoot: 'src',
  buildPath: 'cmd',
});

app.synth();
```

**2. Synthesize to YAML:**

```bash
npx ts-node main.ts       # writes *.yaml to synth-output/
kubectl apply -f synth-output/
```

---

## Pre-built pipelines

Drop-in pipelines for common Go and OCI workflows.

| Construct | Default name | Tasks |
|-----------|-------------|-------|
| `GoPushPipeline` | `go-push` | clone → test |
| `GoPullRequestPipeline` | `go-merge-request` | clone → test + sbom → vuln-scan |
| `ContainerImageBuildPipeline` | `container-image-build` | fix-perms → clone → ko-build |
| `OciBuildPipeline` | `oci-build` | fix-perms → clone → build → sbom → sign |

All accept `{ namespace, name? }` props. The `pipelineName` property reflects the final name used in the manifest.

```typescript
const push = new GoPushPipeline(chart, 'pipeline', {
  namespace: 'tekton-builds',
  name: 'my-go-push',   // optional, overrides default
});
console.log(push.pipelineName); // 'my-go-push'
```

---

## Custom pipelines with `PipelineBuilder`

Compose any pipeline from individual task constructs. Declare dependencies explicitly; tasks sharing the same upstream run in parallel.

```typescript
import {
  PipelineBuilder,
  GitClonePipelineTask,
  GoTestPipelineTask,
  GoBuildPipelineTask,
  GenerateSbomPipelineTask,
  VulnScanPipelineTask,
  PARAM_GIT_URL, PARAM_GIT_REVISION, PARAM_APP_ROOT, PARAM_BUILD_PATH,
  GOLANG_VERSION_PARAM_SPEC, GOLANG_VARIANT_PARAM_SPEC,
  WS_WORKSPACE,
} from '@pfenerty/tekton-pipelines';

// Dependency graph:
//   clone ──┬── test
//           ├── build
//           └── sbom ── vuln-scan
new PipelineBuilder()
  .addFirst('clone', () => new GitClonePipelineTask())
  .addTask('test',  ([c]) => new GoTestPipelineTask({ runAfter: c }),  ['clone'])
  .addTask('build', ([c]) => new GoBuildPipelineTask({ runAfter: c }), ['clone'])
  .addTask('sbom',  ([c]) => new GenerateSbomPipelineTask({ runAfter: c }), ['clone'])
  .addTask('vuln',  ([s]) => new VulnScanPipelineTask({ runAfter: s }), ['sbom'])
  .build(chart, 'pipeline', {
    name: 'my-go-pipeline',
    namespace: 'tekton-builds',
    params: [
      { name: PARAM_GIT_URL, type: 'string' },
      { name: PARAM_GIT_REVISION, type: 'string' },
      { name: PARAM_APP_ROOT, type: 'string' },
      { name: PARAM_BUILD_PATH, type: 'string' },
      GOLANG_VERSION_PARAM_SPEC,
      GOLANG_VARIANT_PARAM_SPEC,
    ],
    workspaces: [{ name: WS_WORKSPACE }],
  });
```

**Builder API:**

| Method | Description |
|--------|-------------|
| `addFirst(key, factory)` | Task with no dependencies (runs first). |
| `addTask(key, factory, dependsOn)` | Task with explicit upstream keys. Tasks sharing `dependsOn` run in parallel. |
| `addAfterAll(key, factory)` | Task that depends on all previously registered tasks. |
| `build(scope, id, opts)` | Topologically sort and emit the `Pipeline` resource. |

---

## Available tasks

### Inline tasks (emit a Tekton `Task` resource)

| Task construct | `Task` name | Pipeline wrapper |
|---------------|-------------|------------------|
| `GoTestTask` | `test-go` | `GoTestPipelineTask` |
| `GoBuildTask` | `build-go` | `GoBuildPipelineTask` |
| `GenerateSbomTask` | `generate-sbom` | `GenerateSbomPipelineTask` |
| `VulnScanTask` | `vulnerability-scan` | `VulnScanPipelineTask` |

### External task references (pipeline step only — Task must be installed separately)

| Pipeline task | External `Task` name |
|--------------|---------------------|
| `GitClonePipelineTask` | `git-clone` (Tekton catalog resolver) |
| `KoBuildPipelineTask` | `ko-build` |
| `BuildOciPipelineTask` | `build-oci` |
| `FixFilePermsPipelineTask` | `fix-file-perms` |
| `GenerateImageSbomPipelineTask` | `vuln-scan` |
| `CosignSignImagePipelineTask` | `cosign-sign-image` |

---

## Extending the library

### Adding a Task

Create `src/lib/tasks/my-task.task.ts` with two exports: the `TektonTaskConstruct` subclass (emits the `Task` resource) and a `PipelineTask` subclass (the pipeline step reference).

```typescript
import { Construct } from 'constructs';
import { TektonTaskConstruct, TektonTaskProps } from './tekton-task-construct';
import { PipelineTask } from './pipeline-task';

export class MyTask extends TektonTaskConstruct {
  static readonly defaultName = 'my-task';

  constructor(scope: Construct, id: string, props: TektonTaskProps) {
    super(scope, id, props, MyTask.defaultName);
  }

  protected buildTaskSpec(): Record<string, unknown> {
    return {
      steps: [{ name: 'run', image: 'alpine', command: ['echo', 'hello'] }],
    };
  }
}

export interface MyPipelineTaskOptions {
  runAfter?: PipelineTask | PipelineTask[];
}

export class MyPipelineTask extends PipelineTask {
  readonly name = 'my-task';

  constructor(opts: MyPipelineTaskOptions = {}) {
    super(opts.runAfter ?? []);
  }

  toSpec(): Record<string, unknown> {
    return this.buildSpec({
      name: this.name,
      taskRef: { kind: 'Task', name: MyTask.defaultName },
    });
  }
}
```

Export both from `src/index.ts`, then instantiate the task construct in a chart and use the pipeline task in a `PipelineBuilder` or pre-built pipeline.

### Adding a Trigger

Extend `GitHubTriggerBase` and provide event-specific config:

```typescript
import { Construct } from 'constructs';
import { GitHubTriggerBase, GitHubTriggerBaseProps } from './github-trigger-base';

export class GitHubTagTrigger extends GitHubTriggerBase {
  constructor(scope: Construct, id: string, props: GitHubTriggerBaseProps) {
    super(scope, id, props, {
      bindingName: 'github-tag-binding',
      templateName: 'github-tag-template',
      pipelineRunGenerateName: 'github-tag-pipeline-run-',
      gitRevisionValue: '$(body.ref)',
    });
  }
}
```

Wire into `TektonInfraChart`'s EventListener `triggers` array using `bindingRef` and `templateRef`.

---

## Constants reference

All constants are exported from the package root.

```typescript
import {
  // Tekton API versions
  TEKTON_API_V1, TRIGGERS_API, PIPELINE_RUN_API,

  // Workspace names
  WS_WORKSPACE, WS_GIT_SOURCE, WS_DOCKERCONFIG,

  // Param names
  PARAM_GIT_URL, PARAM_GIT_REVISION, PARAM_PROJECT_NAME,
  PARAM_APP_ROOT, PARAM_BUILD_PATH, PARAM_IMAGE_NAME,
  PARAM_GOLANG_VERSION, PARAM_GOLANG_VARIANT,
  PARAM_SCAN_TARGET, PARAM_SBOM_PATH, PARAM_OUTPUT_FORMAT,
  PARAM_IMAGE_DIGEST, PARAM_DOCKER_REPO, PARAM_PATH_TO_APP_ROOT,

  // Defaults
  DEFAULT_GOLANG_VERSION, DEFAULT_GOLANG_VARIANT, DEFAULT_OUTPUT_FORMAT,

  // Pinned tool images
  SYFT_IMAGE, GRYPE_IMAGE,
} from '@pfenerty/tekton-pipelines';
```

---

## Requirements

| Dependency | Version |
|-----------|---------|
| Node.js | ≥ 18 |
| cdk8s | ≥ 2.0 |
| constructs | ≥ 10.0 |
| Tekton Pipelines | ≥ v0.59 |
| Tekton Triggers | ≥ v0.26 |

## Development

```bash
npm install        # install dependencies
npm run build      # compile TypeScript → dist/
npm test           # run test suite (49 tests)
npm run synth      # synthesize examples → synth-output/
```
