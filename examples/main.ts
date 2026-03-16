/**
 * Reference implementation showing how to use @pfenerty/tekton-pipelines.
 *
 * Uses the core API: TektonProject, Pipeline, JOBS, and Job.
 *
 * Run: npx ts-node examples/main.ts   (or: make synth)
 * Output: synth-output/*.yaml
 */
import {
  TektonProject,
  Pipeline,
  JOBS,
  Job,
  TRIGGER_EVENTS,
} from '../src';

// ─── Configuration ────────────────────────────────────────────────────────────
const NAMESPACE = 'tekton-builds';

// ─── Define jobs ──────────────────────────────────────────────────────────────
const clone = JOBS.clone();
const gitLog = JOBS.gitLog({ needs: clone });
const test = JOBS.goTest({ needs: clone });
const build = JOBS.goBuild({ needs: clone });
const sbom = JOBS.sbom({ needs: clone });
const vulnScan = JOBS.vulnScan({ needs: sbom });

// ─── Compose pipelines ───────────────────────────────────────────────────────
const pushPipeline = new Pipeline({
  name: 'go-push',
  triggers: [TRIGGER_EVENTS.PUSH],
  jobs: [clone, gitLog, test, build, sbom, vulnScan],
});

const prPipeline = new Pipeline({
  name: 'go-pull-request',
  triggers: [TRIGGER_EVENTS.PULL_REQUEST],
  jobs: [clone, gitLog, test, sbom, vulnScan],
});

// A custom job using an inline script
const lint = new Job({
  name: 'lint',
  image: 'golangci/golangci-lint:latest',
  script: 'golangci-lint run ./...',
  needs: clone,
});

const lintPipeline = new Pipeline({
  name: 'go-lint',
  jobs: [clone, lint],
});

// ─── Synthesize everything ───────────────────────────────────────────────────
new TektonProject({
  name: 'homelab',
  namespace: NAMESPACE,
  pipelines: [pushPipeline, prPipeline, lintPipeline],
  webhookSecretRef: { secretName: 'github-webhook-secret', secretKey: 'secret' },
});
