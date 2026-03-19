import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import {
  TRIGGERS_API,
  PIPELINE_RUN_API,
  DEFAULT_SERVICE_ACCOUNT,
  DEFAULT_WORKSPACE_STORAGE,
  GITHUB_REPO_URL,
} from '../constants';

/** Properties shared by all GitHub trigger variants. */
export interface GitHubTriggerBaseProps {
  /** Kubernetes namespace for generated trigger resources. */
  namespace: string;
  /** Name of the Pipeline resource this trigger starts. */
  pipelineRef: string;
  /** PVC size for the workspace volume claim. Defaults to `"1Gi"`. */
  workspaceStorageSize?: string;
  /** Service account for PipelineRun execution. Defaults to `"tekton-triggers"`. */
  serviceAccountName?: string;
  /** Optional prefix prepended to all resource names. */
  namePrefix?: string;
  /** Pipeline param name for the repository URL. Defaults to `"url"`. */
  urlParam?: string;
  /** Pipeline param name for the git revision. Defaults to `"revision"`. */
  revisionParam?: string;
}

/** Event-specific configuration provided by trigger subclasses. */
export interface GitHubTriggerConfig {
  /** Name for the TriggerBinding resource. */
  bindingName: string;
  /** Name for the TriggerTemplate resource. */
  templateName: string;
  /** `generateName` prefix for PipelineRun resources. */
  pipelineRunGenerateName: string;
  /** CEL/body expression that extracts the git revision from the webhook payload. */
  gitRevisionValue: string;
}

/**
 * Base class for GitHub webhook triggers.
 *
 * Generates a TriggerBinding and TriggerTemplate pair. Subclasses provide
 * event-specific configuration (binding name, revision extraction expression, etc.).
 */
export class GitHubTriggerBase extends Construct {
  /** Fully-qualified TriggerBinding resource name (includes prefix). */
  public readonly bindingRef: string;
  /** Fully-qualified TriggerTemplate resource name (includes prefix). */
  public readonly templateRef: string;

  constructor(scope: Construct, id: string, props: GitHubTriggerBaseProps, config: GitHubTriggerConfig) {
    super(scope, id);

    const p = props.namePrefix ? `${props.namePrefix}-` : '';
    this.bindingRef = `${p}${config.bindingName}`;
    this.templateRef = `${p}${config.templateName}`;

    const serviceAccountName = `${p}${props.serviceAccountName ?? DEFAULT_SERVICE_ACCOUNT}`;
    const workspaceStorage = props.workspaceStorageSize ?? DEFAULT_WORKSPACE_STORAGE;
    const urlParamName = props.urlParam ?? 'url';
    const revisionParamName = props.revisionParam ?? 'revision';

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
              generateName: `${p}${config.pipelineRunGenerateName}`,
              namespace: '$(tt.params.namespace)',
            },
            spec: {
              pipelineRef: { name: props.pipelineRef },
              serviceAccountName,
              params: [
                { name: revisionParamName, value: '$(tt.params.gitrevision)' },
                { name: urlParamName, value: '$(tt.params.gitrepositoryurl)' },
                { name: 'project-name', value: '$(tt.params.projectname)' },
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
