# Triggers and webhooks

This guide explains how GitHub webhooks connect to Tekton pipelines and how to configure the trigger infrastructure.

## Overview

When a GitHub webhook fires, the request flows through:

```
GitHub → EventListener → Interceptor (filter) → TriggerBinding → TriggerTemplate → PipelineRun
```

1. **EventListener** — HTTP endpoint that receives webhook payloads
2. **Interceptors** — filter events by type (push/PR/tag) and optionally validate webhook secrets
3. **TriggerBinding** — extracts values from the webhook payload (revision, URL, project name)
4. **TriggerTemplate** — creates a PipelineRun with the extracted values
5. **PipelineRun** — executes the pipeline

## Automatic generation

When any pipeline has `triggers` set, `TektonProject` automatically generates all infrastructure:

```typescript
const pipeline = new Pipeline({
  triggers: [TRIGGER_EVENTS.PUSH],
  tasks: [myTask],
});

new TektonProject({
  namespace: 'tekton-builds',
  pipelines: [pipeline],
  webhookSecretRef: {
    secretName: 'github-webhook-secret',
    secretKey: 'secret',
  },
});
```

This produces:
- `ServiceAccount` — `tekton-triggers` (or `<prefix>-tekton-triggers`)
- `RoleBinding` — binds the SA to `tekton-triggers-eventlistener-roles`
- `ClusterRoleBinding` — binds the SA to `tekton-triggers-eventlistener-clusterroles`
- `TriggerBinding` — extracts `gitrevision`, `gitrepositoryurl`, `namespace`, `projectname`
- `TriggerTemplate` — creates a `PipelineRun` with workspace volume claim
- `EventListener` — routes events to the correct trigger based on interceptors

## Supported event types

| `TRIGGER_EVENTS` | GitHub event | Interceptor filter | Revision source |
|-------------------|--------------|--------------------|-----------------|
| `PUSH` | `push` | `github` interceptor + CEL `!body.ref.startsWith('refs/tags/')` (when tag pipeline exists) | `body.head_commit.id` |
| `PULL_REQUEST` | `pull_request` | `github` interceptor | `body.pull_request.head.sha` |
| `TAG` | `push` | `github` interceptor + CEL `body.ref.startsWith('refs/tags/')` | `body.ref` |

When both push and tag pipelines exist, a CEL interceptor is added to the push trigger to exclude tag pushes (they're routed to the tag pipeline instead).

## Webhook secret validation

To enable webhook secret validation, provide `webhookSecretRef`:

```typescript
new TektonProject({
  // ...
  webhookSecretRef: {
    secretName: 'github-webhook-secret',
    secretKey: 'secret',
  },
});
```

Create the secret in your cluster:

```bash
kubectl create secret generic github-webhook-secret \
  --namespace=tekton-builds \
  --from-literal=secret=YOUR_WEBHOOK_SECRET
```

The GitHub interceptor validates the `X-Hub-Signature-256` header against this secret.

## Custom param name mapping

By default, the trigger infrastructure maps the repository URL to a pipeline param named `url` and the git revision to `revision`. Override these if your pipeline uses different names:

```typescript
new TektonProject({
  // ...
  urlParam: 'git-url',
  revisionParam: 'git-revision',
  pipelines: [myPipeline],
});
```

This configures the TriggerTemplate to pass values to `$(params.git-url)` and `$(params.git-revision)` instead of the defaults.

## Name prefixing

When `name` is set on `TektonProject`, all trigger resources are prefixed:

```typescript
new TektonProject({
  name: 'my-app',
  // ...
});
```

Produces resources like:
- `my-app-tekton-triggers` (ServiceAccount)
- `my-app-github-push` (TriggerBinding)
- `my-app-github-push-trigger-template` (TriggerTemplate)
- `my-app-github-listener` (EventListener)

This allows multiple projects to coexist in the same namespace.

## RBAC requirements

The generated infrastructure requires two Tekton cluster roles to be present (installed with Tekton Triggers):

- `tekton-triggers-eventlistener-roles` — namespace-scoped role for EventListener operation
- `tekton-triggers-eventlistener-clusterroles` — cluster-scoped role for EventListener operation

The generated `RoleBinding` and `ClusterRoleBinding` bind the trigger ServiceAccount to these roles.

## Exposing the EventListener

The EventListener creates a Kubernetes Service named `el-<prefix>-github-listener`. To receive webhooks from GitHub, expose it:

**Port-forward (development):**
```bash
kubectl port-forward -n tekton-builds svc/el-github-listener 8080
```

**Ingress (production):**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tekton-webhook
  namespace: tekton-builds
spec:
  rules:
    - host: tekton.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: el-github-listener
                port:
                  number: 8080
```

## Multiple trigger types

You can assign different trigger types to different pipelines:

```typescript
const push = new Pipeline({
  triggers: [TRIGGER_EVENTS.PUSH],
  tasks: [test],
});

const pr = new Pipeline({
  triggers: [TRIGGER_EVENTS.PULL_REQUEST],
  tasks: [test, build],
});

const release = new Pipeline({
  triggers: [TRIGGER_EVENTS.TAG],
  tasks: [test, build, publish],
});

new TektonProject({
  namespace: 'tekton-builds',
  pipelines: [push, pr, release],
});
```

All three triggers share a single EventListener with separate interceptor chains.
