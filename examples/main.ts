/**
 * Reference implementation showing how to use @pfenerty/tekton-pipelines.
 *
 * Demonstrates two approaches:
 *
 *  1. Pre-built pipeline constructs — drop-in pipelines for common Go and OCI
 *     workflows. Instantiate, configure via props, done.
 *
 *  2. PipelineBuilder — compose your own pipeline from individual task constructs,
 *     with full control over the dependency graph (sequential, parallel, or mixed).
 *
 * Run: npx ts-node examples/main.ts   (or: make synth)
 * Output: synth-output/*.yaml
 */
import { App, Chart } from 'cdk8s';
import {
  GoTestTask,
  GoBuildTask,
  GenerateSbomTask,
  VulnScanTask,
  GoPushPipeline,
  GoPullRequestPipeline,
  ContainerImageBuildPipeline,
  OciBuildPipeline,
  TektonInfraChart,
  PipelineBuilder,
  GitClonePipelineTask,
  GoTestPipelineTask,
  GenerateSbomPipelineTask,
  VulnScanPipelineTask,
  PARAM_GIT_URL,
  PARAM_GIT_REVISION,
  PARAM_PROJECT_NAME,
  PARAM_APP_ROOT,
  PARAM_BUILD_PATH,
  WS_WORKSPACE,
  GOLANG_VERSION_PARAM_SPEC,
  GOLANG_VARIANT_PARAM_SPEC,
} from '../src';

// ─── Configuration ────────────────────────────────────────────────────────────
const NAMESPACE = 'tekton-builds';

const app = new App();

// ─── Tasks ────────────────────────────────────────────────────────────────────
// Each task gets its own Chart so it can be applied independently.

const goTestChart = new Chart(app, 'task-go-test');
new GoTestTask(goTestChart, 'task', { namespace: NAMESPACE });

const goBuildChart = new Chart(app, 'task-go-build');
new GoBuildTask(goBuildChart, 'task', { namespace: NAMESPACE });

const generateSbomChart = new Chart(app, 'task-generate-sbom');
new GenerateSbomTask(generateSbomChart, 'task', { namespace: NAMESPACE });

const vulnScanChart = new Chart(app, 'task-vuln-scan');
new VulnScanTask(vulnScanChart, 'task', { namespace: NAMESPACE });

// ─── Pre-built Go CI pipelines ────────────────────────────────────────────────
// Ready-to-use pipelines for common Go workflows. Reference via pipelineName
// in your TektonInfraChart trigger wiring.

const goPushChart = new Chart(app, 'pipeline-go-push');
new GoPushPipeline(goPushChart, 'pipeline', { namespace: NAMESPACE });

const goPrChart = new Chart(app, 'pipeline-go-pull-request');
new GoPullRequestPipeline(goPrChart, 'pipeline', { namespace: NAMESPACE });

// ─── Pre-built OCI image pipelines ───────────────────────────────────────────
// (requires external tasks: fix-file-perms, ko-build, build-oci, cosign-sign-image)

const cibChart = new Chart(app, 'pipeline-container-image-build');
new ContainerImageBuildPipeline(cibChart, 'pipeline', { namespace: NAMESPACE });

const ociBuildChart = new Chart(app, 'pipeline-oci-build');
new OciBuildPipeline(ociBuildChart, 'pipeline', { namespace: NAMESPACE });

// ─── Custom pipeline via PipelineBuilder ──────────────────────────────────────
// Build your own pipeline by composing task constructs with an explicit
// dependency graph. Tasks with the same dependency set run in parallel.
//
// This example replicates go-merge-request but gives you full control:
//
//   clone ──┬── test
//           └── sbom ── vuln-scan
//
const customChart = new Chart(app, 'pipeline-custom-go');
new PipelineBuilder()
  // 'clone' has no dependencies — it runs first.
  .addFirst('clone', () => new GitClonePipelineTask())
  // 'test' and 'sbom' both depend only on 'clone' → they run in parallel.
  .addTask('test', ([clone]) => new GoTestPipelineTask({ runAfter: clone }), ['clone'])
  .addTask('sbom', ([clone]) => new GenerateSbomPipelineTask({ runAfter: clone }), ['clone'])
  // 'vuln' depends on 'sbom' → it runs after sbom completes.
  .addTask('vuln', ([sbom]) => new VulnScanPipelineTask({ runAfter: sbom }), ['sbom'])
  .build(customChart, 'pipeline', {
    name: 'my-custom-go-pipeline',
    namespace: NAMESPACE,
    params: [
      { name: PARAM_GIT_URL, type: 'string' },
      { name: PARAM_GIT_REVISION, type: 'string' },
      { name: PARAM_PROJECT_NAME, type: 'string' },
      { name: PARAM_APP_ROOT, type: 'string' },
      { name: PARAM_BUILD_PATH, type: 'string' },
      GOLANG_VERSION_PARAM_SPEC,
      GOLANG_VARIANT_PARAM_SPEC,
    ],
    workspaces: [{ name: WS_WORKSPACE }],
  });

// ─── Shared trigger infrastructure ────────────────────────────────────────────
// ServiceAccount + RBAC, TriggerBindings, TriggerTemplates, EventListener.
//
// Point pushPipelineRef / pullRequestPipelineRef at any pipeline by name —
// either a pre-built one above or your custom builder pipeline.
new TektonInfraChart(app, 'tekton-infra', {
  namespace: NAMESPACE,
  pushPipelineRef: 'go-push',
  pullRequestPipelineRef: 'go-merge-request',
  appRoot: 'src',
  buildPath: 'cmd',
});

// Suppress unused-variable warnings for task/pipeline charts (exist for synthesis).
void goTestChart, goBuildChart, generateSbomChart, vulnScanChart;
void goPushChart, goPrChart, cibChart, ociBuildChart;
void customChart;

app.synth();
