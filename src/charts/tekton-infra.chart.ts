import { Construct } from 'constructs';
import { ApiObject, Chart, ChartProps } from 'cdk8s';
import { GitHubPushTrigger } from '../lib/triggers/github-push.trigger';
import { GitHubPullRequestTrigger } from '../lib/triggers/github-pull-request.trigger';

export interface TektonInfraChartProps extends ChartProps {
  namespace: string;
  /** Name of the pipeline to run on push events (default: 'go-push'). */
  pushPipelineRef?: string;
  /** Name of the pipeline to run on pull_request events (default: 'go-merge-request'). */
  pullRequestPipelineRef?: string;
  /** Default app-root for trigger templates (default: 'src'). */
  appRoot?: string;
  /** Default build-path for trigger templates (default: 'cmd'). */
  buildPath?: string;
  /** Project name prefix for multi-tenant resource naming. */
  namePrefix?: string;
  /** Reference to an existing K8s Secret for GitHub webhook HMAC validation. */
  webhookSecretRef?: { secretName: string; secretKey: string };
}

/**
 * Chart that provisions the shared Tekton infrastructure:
 *   - ServiceAccount (tekton-triggers)
 *   - RoleBinding  → ClusterRole tekton-triggers-eventlistener-roles
 *   - ClusterRoleBinding → ClusterRole tekton-triggers-eventlistener-clusterroles
 *   - GitHub push TriggerBinding + TriggerTemplate
 *   - GitHub pull request TriggerBinding + TriggerTemplate
 *   - EventListener wiring all triggers together
 *
 * To add a new event source, create a new trigger construct and add an entry
 * to the EventListener's triggers array in this chart.
 */
export class TektonInfraChart extends Chart {
  constructor(scope: Construct, id: string, props: TektonInfraChartProps) {
    super(scope, id, props);

    const namespace = props.namespace;
    const p = props.namePrefix ? `${props.namePrefix}-` : '';
    const serviceAccountName = `${p}tekton-triggers`;

    // ── RBAC ─────────────────────────────────────────────────────────────────

    new ApiObject(this, 'service-account', {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: { name: serviceAccountName, namespace },
    });

    new ApiObject(this, 'role-binding', {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name: `${p}tekton-triggers-eventlistener`, namespace },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: 'tekton-triggers-eventlistener-roles',
      },
      subjects: [{ kind: 'ServiceAccount', name: serviceAccountName }],
    });

    new ApiObject(this, 'cluster-role-binding', {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRoleBinding',
      metadata: { name: `${p}tekton-triggers-eventlistener` },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: 'tekton-triggers-eventlistener-clusterroles',
      },
      subjects: [{ kind: 'ServiceAccount', name: serviceAccountName, namespace }],
    });

    // ── Triggers ──────────────────────────────────────────────────────────────

    const pushTrigger = new GitHubPushTrigger(this, 'github-push-trigger', {
      namespace,
      namePrefix: props.namePrefix,
      pipelineRef: props.pushPipelineRef ?? 'go-push',
      appRoot: props.appRoot,
      buildPath: props.buildPath,
    });

    const prTrigger = new GitHubPullRequestTrigger(this, 'github-pr-trigger', {
      namespace,
      namePrefix: props.namePrefix,
      pipelineRef: props.pullRequestPipelineRef ?? 'go-merge-request',
      appRoot: props.appRoot,
      buildPath: props.buildPath,
    });

    // ── EventListener ─────────────────────────────────────────────────────────

    new ApiObject(this, 'event-listener', {
      apiVersion: 'triggers.tekton.dev/v1beta1',
      kind: 'EventListener',
      metadata: { name: `${p}github-listener`, namespace },
      spec: {
        serviceAccountName,
        triggers: [
          {
            bindings: [{ kind: 'TriggerBinding', ref: pushTrigger.bindingRef }],
            interceptors: [
              {
                ref: { kind: 'ClusterInterceptor', name: 'github' },
                params: [
                  { name: 'eventTypes', value: ['push'] },
                  ...(props.webhookSecretRef ? [{ name: 'secretRef', value: props.webhookSecretRef }] : []),
                ],
              },
            ],
            template: { ref: pushTrigger.templateRef },
          },
          {
            bindings: [{ kind: 'TriggerBinding', ref: prTrigger.bindingRef }],
            interceptors: [
              {
                ref: { kind: 'ClusterInterceptor', name: 'github' },
                params: [
                  { name: 'eventTypes', value: ['pull_request'] },
                  ...(props.webhookSecretRef ? [{ name: 'secretRef', value: props.webhookSecretRef }] : []),
                ],
              },
            ],
            template: { ref: prTrigger.templateRef },
          },
        ],
      },
    });
  }
}
