/** Tekton Pipelines v1 API version. */
export const TEKTON_API_V1 = 'tekton.dev/v1';
/** Tekton Triggers v1beta1 API version. */
export const TRIGGERS_API = 'triggers.tekton.dev/v1beta1';
/** API version used for PipelineRun resources. */
export const PIPELINE_RUN_API = 'tekton.dev/v1';

/** Default service account name for trigger infrastructure. */
export const DEFAULT_SERVICE_ACCOUNT = 'tekton-triggers';
/** Default PVC storage size for pipeline workspace volumes. */
export const DEFAULT_WORKSPACE_STORAGE = '1Gi';

/** CEL expression that constructs the GitHub repository URL from webhook payload. */
export const GITHUB_REPO_URL = 'https://github.com/$(body.repository.full_name)';

/**
 * Default security context applied to all task steps.
 * Drops all capabilities and enables seccomp RuntimeDefault profile.
 */
export const DEFAULT_STEP_SECURITY_CONTEXT = {
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] },
  seccompProfile: { type: 'RuntimeDefault' },
} as const;

/**
 * Restricted security context that additionally enforces `runAsNonRoot`.
 * Use for steps that should never run as UID 0 (e.g. git-clone with Chainguard images).
 */
export const RESTRICTED_STEP_SECURITY_CONTEXT = {
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] },
  runAsNonRoot: true,
  seccompProfile: { type: 'RuntimeDefault' },
} as const;

/**
 * Default CPU/memory requests and limits applied to each task step.
 * Override per-step via the `computeResources` field on `TaskStepSpec`.
 */
export const DEFAULT_STEP_RESOURCES = {
  requests: { cpu: '100m', memory: '128Mi' },
  limits: { cpu: '1', memory: '512Mi' },
} as const;
