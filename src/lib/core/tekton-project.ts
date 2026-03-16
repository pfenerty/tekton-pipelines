import { App, Chart } from 'cdk8s';
import { PipelineParamSpec } from '../../types';
import { TektonInfraChart } from '../../charts/tekton-infra.chart';
import {
  PARAM_GIT_URL,
  PARAM_GIT_REVISION,
  PARAM_PROJECT_NAME,
  PARAM_APP_ROOT,
  PARAM_BUILD_PATH,
  DEFAULT_APP_ROOT,
  DEFAULT_BUILD_PATH,
} from '../constants';
import { Pipeline } from './pipeline';
import { TRIGGER_EVENTS } from './trigger-events';

export interface TektonProjectOptions {
  namespace: string;
  pipelines: Pipeline[];
  serviceAccountName?: string;
  workspaceStorageSize?: string;
  appRoot?: string;
  buildPath?: string;
}

export class TektonProject {
  constructor(opts: TektonProjectOptions) {
    const app = new App();
    const namespace = opts.namespace;
    const appRoot = opts.appRoot ?? DEFAULT_APP_ROOT;
    const buildPath = opts.buildPath ?? DEFAULT_BUILD_PATH;

    const baseParams: PipelineParamSpec[] = [
      { name: PARAM_GIT_URL, type: 'string' },
      { name: PARAM_GIT_REVISION, type: 'string' },
      { name: PARAM_PROJECT_NAME, type: 'string' },
      {
        name: PARAM_APP_ROOT,
        description: 'path to root of the app (should contain go.mod, go.sum files)',
        type: 'string',
      },
      {
        name: PARAM_BUILD_PATH,
        description: 'path under app-root to target for build',
        type: 'string',
      },
    ];

    // 1. Collect unique task resources across all pipelines
    const taskResources = new Map<
      string,
      (scope: import('constructs').Construct, id: string, ns: string) => void
    >();
    for (const pipeline of opts.pipelines) {
      for (const job of pipeline.jobs) {
        const { taskResourceName, createTaskResource } = job._internals;
        if (createTaskResource && !taskResources.has(taskResourceName)) {
          taskResources.set(taskResourceName, createTaskResource);
        }
      }
    }

    // 2. Create a Chart per task resource
    for (const [name, factory] of taskResources) {
      const chart = new Chart(app, `task-${name}`);
      factory(chart, 'task', namespace);
    }

    // 3. Build each pipeline
    for (const pipeline of opts.pipelines) {
      const chart = new Chart(app, `pipeline-${pipeline.name}`);
      pipeline._build(chart, 'pipeline', namespace, baseParams);
    }

    // 4. Create infra chart if any pipeline has triggers
    const pushPipeline = opts.pipelines.find(p =>
      p.triggers.includes(TRIGGER_EVENTS.PUSH),
    );
    const prPipeline = opts.pipelines.find(p =>
      p.triggers.includes(TRIGGER_EVENTS.PULL_REQUEST),
    );

    if (pushPipeline || prPipeline) {
      new TektonInfraChart(app, 'tekton-infra', {
        namespace,
        pushPipelineRef: pushPipeline?.name,
        pullRequestPipelineRef: prPipeline?.name,
        appRoot,
        buildPath,
      });
    }

    // 5. Synth
    app.synth();
  }
}
