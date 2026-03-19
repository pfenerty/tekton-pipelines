import { App, Chart } from 'cdk8s';
import { TektonInfraChart } from '../../charts/tekton-infra.chart';
import { Pipeline } from './pipeline';
import { Task } from './task';
import { TRIGGER_EVENTS } from './trigger-events';

/** Options for constructing a {@link TektonProject}. */
export interface TektonProjectOptions {
  /** Optional name prefix applied to all generated resource names. */
  name?: string;
  /** Kubernetes namespace for all generated resources. */
  namespace: string;
  /** Pipelines to synthesize. */
  pipelines: Pipeline[];
  /** Service account name for trigger infrastructure. Defaults to `"tekton-triggers"`. */
  serviceAccountName?: string;
  /** PVC size for pipeline workspace volumes. Defaults to `"1Gi"`. */
  workspaceStorageSize?: string;
  /** Kubernetes Secret reference for GitHub webhook validation. */
  webhookSecretRef?: { secretName: string; secretKey: string };
  /** Output directory for synthesized YAML. Defaults to cdk8s default (`dist`). */
  outdir?: string;
  /** Pipeline param name that receives the repository URL. Defaults to `"url"`. */
  urlParam?: string;
  /** Pipeline param name that receives the git revision. Defaults to `"revision"`. */
  revisionParam?: string;
}

/**
 * Top-level orchestrator that synthesizes an entire Tekton project to YAML.
 *
 * Given a set of pipelines, TektonProject:
 * 1. Collects and de-duplicates all tasks across pipelines
 * 2. Synthesizes each task as a separate Tekton Task resource
 * 3. Builds each pipeline with auto-inferred params and workspaces
 * 4. Generates trigger infrastructure (RBAC, EventListener, TriggerBindings/Templates)
 *    for any pipeline associated with a {@link TRIGGER_EVENTS | trigger event}
 * 5. Writes all resources as YAML files to the output directory
 */
export class TektonProject {
  constructor(opts: TektonProjectOptions) {
    const app = new App(opts.outdir ? { outdir: opts.outdir } : undefined);
    const prefix = opts.name ?? '';
    const namespace = opts.namespace;

    // 1. Collect unique Tasks across all pipelines
    const uniqueTasks = new Map<string, Task>();
    for (const pipeline of opts.pipelines) {
      for (const task of pipeline.allTasks) {
        if (!uniqueTasks.has(task.name)) {
          uniqueTasks.set(task.name, task);
        }
      }
    }

    // 2. Synth each unique Task
    for (const [name, task] of uniqueTasks) {
      const chart = new Chart(app, prefix ? `${prefix}-task-${name}` : `task-${name}`);
      task.synth(chart, namespace, prefix || undefined);
    }

    // 3. Build each Pipeline
    for (const pipeline of opts.pipelines) {
      const chart = new Chart(app, prefix ? `${prefix}-pipeline-${pipeline.name}` : `pipeline-${pipeline.name}`);
      const extraParams = pipeline.triggers.length > 0
        ? [{ name: 'project-name', type: 'string' }]
        : [];
      pipeline._build(chart, 'pipeline', namespace, extraParams, prefix || undefined);
    }

    // 4. Create infra chart if any pipeline has triggers
    const pushPipeline = opts.pipelines.find(p =>
      p.triggers.includes(TRIGGER_EVENTS.PUSH),
    );
    const prPipeline = opts.pipelines.find(p =>
      p.triggers.includes(TRIGGER_EVENTS.PULL_REQUEST),
    );
    const tagPipeline = opts.pipelines.find(p =>
      p.triggers.includes(TRIGGER_EVENTS.TAG),
    );

    if (pushPipeline || prPipeline || tagPipeline) {
      const prefixName = (name: string) => prefix ? `${prefix}-${name}` : name;
      new TektonInfraChart(app, prefix ? `${prefix}-tekton-infra` : 'tekton-infra', {
        namespace,
        namePrefix: prefix || undefined,
        pushPipelineRef: pushPipeline ? prefixName(pushPipeline.name) : undefined,
        pullRequestPipelineRef: prPipeline ? prefixName(prPipeline.name) : undefined,
        tagPipelineRef: tagPipeline ? prefixName(tagPipeline.name) : undefined,
        webhookSecretRef: opts.webhookSecretRef,
        urlParam: opts.urlParam,
        revisionParam: opts.revisionParam,
      });
    }

    // 5. Synth
    app.synth();
  }
}
