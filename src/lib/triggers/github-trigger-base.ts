import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import {
  TRIGGERS_API,
  PIPELINE_RUN_API,
  DEFAULT_SERVICE_ACCOUNT,
  DEFAULT_WORKSPACE_STORAGE,
  DEFAULT_APP_ROOT,
  DEFAULT_BUILD_PATH,
  GITHUB_REPO_URL,
} from '../constants';

export interface GitHubTriggerBaseProps {
  namespace: string;
  /** Name of the Pipeline to run on events. */
  pipelineRef: string;
  /** Default value for app-root param passed to the PipelineRun (default: 'src'). */
  appRoot?: string;
  /** Default value for build-path param passed to the PipelineRun (default: 'cmd'). */
  buildPath?: string;
  /** Size of the PVC created per PipelineRun (default: '1Gi'). */
  workspaceStorageSize?: string;
  /** ServiceAccount used to run PipelineRuns (default: 'tekton-triggers'). */
  serviceAccountName?: string;
}

export interface GitHubTriggerConfig {
  bindingName: string;
  templateName: string;
  pipelineRunGenerateName: string;
  gitRevisionValue: string;
}

/**
 * Base class for GitHub event trigger constructs.
 *
 * Creates a TriggerBinding and TriggerTemplate that react to a GitHub webhook
 * event and launch a PipelineRun. Subclasses provide event-specific config
 * (names, CEL expression for git revision) via the config parameter.
 *
 * Expose bindingRef / templateRef to wire into an EventListener trigger entry.
 */
export class GitHubTriggerBase extends Construct {
  public readonly bindingRef: string;
  public readonly templateRef: string;

  constructor(scope: Construct, id: string, props: GitHubTriggerBaseProps, config: GitHubTriggerConfig) {
    super(scope, id);

    this.bindingRef = config.bindingName;
    this.templateRef = config.templateName;

    const serviceAccountName = props.serviceAccountName ?? DEFAULT_SERVICE_ACCOUNT;
    const workspaceStorage = props.workspaceStorageSize ?? DEFAULT_WORKSPACE_STORAGE;
    const appRoot = props.appRoot ?? DEFAULT_APP_ROOT;
    const buildPath = props.buildPath ?? DEFAULT_BUILD_PATH;

    new ApiObject(this, 'binding', {
      apiVersion: TRIGGERS_API,
      kind: 'TriggerBinding',
      metadata: {
        name: this.bindingRef,
        namespace: props.namespace,
      },
      spec: {
        params: [
          { name: 'gitrevision', value: config.gitRevisionValue },
          { name: 'namespace', value: props.namespace },
          { name: 'gitrepositoryurl', value: GITHUB_REPO_URL },
          { name: 'projectname', value: '$(body.repository.name)' },
        ],
      },
    });

    new ApiObject(this, 'template', {
      apiVersion: TRIGGERS_API,
      kind: 'TriggerTemplate',
      metadata: {
        name: this.templateRef,
        namespace: props.namespace,
      },
      spec: {
        params: [
          { name: 'gitrevision', description: 'The git revision' },
          { name: 'gitrepositoryurl', description: 'The git repository url' },
          { name: 'namespace', description: 'The namespace to create the resources' },
          { name: 'projectname', description: 'name of the project' },
        ],
        resourcetemplates: [
          {
            apiVersion: PIPELINE_RUN_API,
            kind: 'PipelineRun',
            metadata: {
              generateName: config.pipelineRunGenerateName,
              namespace: '$(tt.params.namespace)',
            },
            spec: {
              pipelineRef: { name: props.pipelineRef },
              serviceAccountName,
              params: [
                { name: 'git-revision', value: '$(tt.params.gitrevision)' },
                { name: 'git-url', value: '$(tt.params.gitrepositoryurl)' },
                { name: 'project-name', value: '$(tt.params.projectname)' },
                { name: 'app-root', value: appRoot },
                { name: 'build-path', value: buildPath },
              ],
              workspaces: [
                {
                  name: 'workspace',
                  volumeClaimTemplate: {
                    spec: {
                      accessModes: ['ReadWriteOnce'],
                      resources: { requests: { storage: workspaceStorage } },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });
  }
}
