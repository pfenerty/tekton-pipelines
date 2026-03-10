import { App, Chart } from 'cdk8s';
import { GoTestTask } from './lib/tasks/go-test.task';
import { GoBuildTask } from './lib/tasks/go-build.task';
import { GenerateSbomTask } from './lib/tasks/generate-sbom.task';
import { VulnScanTask } from './lib/tasks/vuln-scan.task';
import { GoPushPipeline } from './lib/pipelines/go-push.pipeline';
import { GoPullRequestPipeline } from './lib/pipelines/go-pull-request.pipeline';
import { ContainerImageBuildPipeline } from './lib/pipelines/container-image-build.pipeline';
import { OciBuildPipeline } from './lib/pipelines/oci-build.pipeline';
import { TektonInfraChart } from './charts/tekton-infra.chart';

// ─── Configuration ────────────────────────────────────────────────────────────
// All Tekton resources are deployed into a single namespace.
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

// ─── Go CI pipelines ──────────────────────────────────────────────────────────
// Pipelines reference tasks by name via GoTestTask.defaultName etc.

const goPushChart = new Chart(app, 'pipeline-go-push');
new GoPushPipeline(goPushChart, 'pipeline', { namespace: NAMESPACE });

const goPrChart = new Chart(app, 'pipeline-go-pull-request');
new GoPullRequestPipeline(goPrChart, 'pipeline', { namespace: NAMESPACE });

// ─── OCI image pipelines ──────────────────────────────────────────────────────
// (requires external tasks: fix-file-perms, ko-build, build-oci, vuln-scan, cosign-sign-image)

const cibChart = new Chart(app, 'pipeline-container-image-build');
new ContainerImageBuildPipeline(cibChart, 'pipeline', { namespace: NAMESPACE });

const ociBuildChart = new Chart(app, 'pipeline-oci-build');
new OciBuildPipeline(ociBuildChart, 'pipeline', { namespace: NAMESPACE });

// ─── Shared trigger infrastructure ────────────────────────────────────────────
// ServiceAccount + RBAC, TriggerBindings, TriggerTemplates, EventListener
//
// pushPipelineRef and pullRequestPipelineRef link the GitHub webhook events
// to the pipelines defined above. Change these to point at different pipelines
// without touching the trigger definitions.
new TektonInfraChart(app, 'tekton-infra', {
  namespace: NAMESPACE,
  pushPipelineRef: 'go-push',
  pullRequestPipelineRef: 'go-merge-request',
  appRoot: 'src',
  buildPath: 'cmd',
});

// Suppress unused-variable warnings for task charts (they exist for synthesis).
void goTestChart, goBuildChart, generateSbomChart, vulnScanChart;
void goPushChart, goPrChart, cibChart, ociBuildChart;

app.synth();
