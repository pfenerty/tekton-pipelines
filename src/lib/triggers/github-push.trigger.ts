import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';

export interface GitHubPushTriggerProps {
  namespace: string;
  /** Name of the Pipeline to run on push events. */
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

/**
 * Composes a TriggerBinding and TriggerTemplate for GitHub push events.
 *
 * The binding extracts:
 *   gitrevision      - head commit SHA
 *   gitrepositoryurl - full HTTPS clone URL
 *   projectname      - repository name
 *   namespace        - target namespace (set to props.namespace)
 *
 * The template creates a PipelineRun referencing props.pipelineRef.
 *
 * Expose bindingRef / templateRef to wire into an EventListener trigger entry.
 */
export class GitHubPushTrigger extends Construct {
  public readonly bindingRef: string;
  public readonly templateRef: string;

  constructor(scope: Construct, id: string, props: GitHubPushTriggerProps) {
    super(scope, id);

    this.bindingRef = 'github-push';
    this.templateRef = 'github-push-trigger-template';

    const serviceAccountName = props.serviceAccountName ?? 'tekton-triggers';
    const workspaceStorage = props.workspaceStorageSize ?? '1Gi';
    const appRoot = props.appRoot ?? 'src';
    const buildPath = props.buildPath ?? 'cmd';

    new ApiObject(this, 'binding', {
      apiVersion: 'triggers.tekton.dev/v1beta1',
      kind: 'TriggerBinding',
      metadata: {
        name: this.bindingRef,
        namespace: props.namespace,
      },
      spec: {
        params: [
          { name: 'gitrevision', value: '$(body.head_commit.id)' },
          { name: 'namespace', value: props.namespace },
          { name: 'gitrepositoryurl', value: 'https://github.com/$(body.repository.full_name)' },
          { name: 'projectname', value: '$(body.repository.name)' },
        ],
      },
    });

    new ApiObject(this, 'template', {
      apiVersion: 'triggers.tekton.dev/v1beta1',
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
            apiVersion: 'tekton.dev/v1beta1',
            kind: 'PipelineRun',
            metadata: {
              generateName: 'github-push-pipeline-run-',
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
