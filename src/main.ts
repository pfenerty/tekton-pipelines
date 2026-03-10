import { App } from 'cdk8s';
import { TektonInfraChart } from './charts/tekton-infra.chart';
import { GoPipelinesChart } from './charts/go-pipelines.chart';
import { OciPipelinesChart } from './charts/oci-pipelines.chart';

// ─── Configuration ────────────────────────────────────────────────────────────
// All Tekton resources are deployed into a single namespace.
const NAMESPACE = 'tekton-builds';

const app = new App();

// ─── Go CI pipelines ──────────────────────────────────────────────────────────
// Tasks: test-go, build-go, generate-sbom, vulnerability-scan
// Pipelines: go-push, go-merge-request
new GoPipelinesChart(app, 'go-pipelines', { namespace: NAMESPACE });

// ─── OCI image pipelines ──────────────────────────────────────────────────────
// Pipelines: container-image-build, oci-build
// (requires external tasks: fix-file-perms, ko-build, build-oci, vuln-scan, cosign-sign-image)
new OciPipelinesChart(app, 'oci-pipelines', { namespace: NAMESPACE });

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

app.synth();
