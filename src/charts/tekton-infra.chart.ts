import { Construct } from 'constructs';
import { ApiObject, Chart, ChartProps } from 'cdk8s';
import { GitHubPushTrigger } from '../lib/triggers/github-push.trigger';
import { GitHubPullRequestTrigger } from '../lib/triggers/github-pull-request.trigger';
import { GitHubTagTrigger } from '../lib/triggers/github-tag.trigger';

/** Properties for the {@link TektonInfraChart}. */
export interface TektonInfraChartProps extends ChartProps {
  /** Kubernetes namespace for all infrastructure resources. */
  namespace: string;
  /** Pipeline name referenced by the push trigger. */
  pushPipelineRef?: string;
  /** Pipeline name referenced by the pull request trigger. */
  pullRequestPipelineRef?: string;
  /** Pipeline name referenced by the tag trigger. */
  tagPipelineRef?: string;
  /** Optional prefix prepended to all resource names. */
  namePrefix?: string;
  /** Kubernetes Secret reference for GitHub webhook validation. */
  webhookSecretRef?: { secretName: string; secretKey: string };
  /** Pipeline param name for the repository URL. Defaults to `"url"`. */
  urlParam?: string;
  /** Pipeline param name for the git revision. Defaults to `"revision"`. */
  revisionParam?: string;
}

/**
 * cdk8s Chart that generates the shared trigger infrastructure:
 * - ServiceAccount and RBAC (RoleBinding + ClusterRoleBinding)
 * - TriggerBindings and TriggerTemplates for push, PR, and tag events
 * - EventListener with GitHub interceptors and CEL filters
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

    const triggerProps = {
      namespace,
      namePrefix: props.namePrefix,
      urlParam: props.urlParam,
      revisionParam: props.revisionParam,
    };

    const pushTrigger = new GitHubPushTrigger(this, 'github-push-trigger', {
      ...triggerProps,
      pipelineRef: props.pushPipelineRef ?? 'push-pipeline',
    });

    const prTrigger = new GitHubPullRequestTrigger(this, 'github-pr-trigger', {
      ...triggerProps,
      pipelineRef: props.pullRequestPipelineRef ?? 'pull-request-pipeline',
    });

    // ── EventListener ─────────────────────────────────────────────────────────

    const triggers: Record<string, unknown>[] = [
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
          ...(props.tagPipelineRef ? [{
            ref: { kind: 'ClusterInterceptor', name: 'cel' },
            params: [
              { name: 'filter', value: "!body.ref.startsWith('refs/tags/')" },
            ],
          }] : []),
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
    ];

    if (props.tagPipelineRef) {
      const tagTrigger = new GitHubTagTrigger(this, 'github-tag-trigger', {
        ...triggerProps,
        pipelineRef: props.tagPipelineRef,
      });

      triggers.push({
        bindings: [{ kind: 'TriggerBinding', ref: tagTrigger.bindingRef }],
        interceptors: [
          {
            ref: { kind: 'ClusterInterceptor', name: 'github' },
            params: [
              { name: 'eventTypes', value: ['push'] },
              ...(props.webhookSecretRef ? [{ name: 'secretRef', value: props.webhookSecretRef }] : []),
            ],
          },
          {
            ref: { kind: 'ClusterInterceptor', name: 'cel' },
            params: [
              { name: 'filter', value: "body.ref.startsWith('refs/tags/')" },
            ],
          },
        ],
        template: { ref: tagTrigger.templateRef },
      });
    }

    new ApiObject(this, 'event-listener', {
      apiVersion: 'triggers.tekton.dev/v1beta1',
      kind: 'EventListener',
      metadata: { name: `${p}github-listener`, namespace },
      spec: {
        serviceAccountName,
        triggers,
      },
    });
  }
}
