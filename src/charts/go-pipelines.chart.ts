import { Construct } from 'constructs';
import { Chart, ChartProps } from 'cdk8s';
import { GoTestTask } from '../lib/tasks/go-test.task';
import { GoBuildTask } from '../lib/tasks/go-build.task';
import { GoPushPipeline } from '../lib/pipelines/go-push.pipeline';
import { GoPullRequestPipeline } from '../lib/pipelines/go-pull-request.pipeline';
import { GenerateSbomTask } from '../lib/tasks/generate-sbom.task';
import { VulnScanTask } from '../lib/tasks/vuln-scan.task';

export interface GoPipelinesChartProps extends ChartProps {
  namespace: string;
}

/**
 * Chart that provisions all Go build / CI tasks and pipelines:
 *
 * Tasks:
 *   test-go            - runs `go test`
 *   build-go           - runs `go build`
 *   generate-sbom      - generates a CycloneDX SBOM with Syft
 *   vulnerability-scan - scans a SBOM with Grype
 *
 * Pipelines:
 *   go-push          - clone → test   (used by push events)
 *   go-merge-request - clone → test + generate-sbom → vulnerability-scan
 *                      (used by pull_request events)
 */
export class GoPipelinesChart extends Chart {
  constructor(scope: Construct, id: string, props: GoPipelinesChartProps) {
    super(scope, id, props);

    const namespace = props.namespace;

    // ── Tasks ─────────────────────────────────────────────────────────────────

    const testTask = new GoTestTask(this, 'go-test-task', { namespace });
    const buildTask = new GoBuildTask(this, 'go-build-task', { namespace });
    const sbomTask = new GenerateSbomTask(this, 'generate-sbom-task', { namespace });
    const vulnTask = new VulnScanTask(this, 'vuln-scan-task', { namespace });

    // ── Pipelines ─────────────────────────────────────────────────────────────

    new GoPushPipeline(this, 'go-push-pipeline', {
      namespace,
      testTaskName: testTask.taskName,
    });

    new GoPullRequestPipeline(this, 'go-pr-pipeline', {
      namespace,
      testTaskName: testTask.taskName,
      sbomTaskName: sbomTask.taskName,
      vulnScanTaskName: vulnTask.taskName,
    });

    // GoBuildTask is defined here so it is available in the cluster for
    // pipelines that need explicit build steps (e.g. a future build-and-push
    // pipeline). It is not wired into go-push/go-merge-request by default
    // because those pipelines use the Tekton catalog git-clone + go test.
    void buildTask;
  }
}
