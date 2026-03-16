export const TEKTON_API_V1 = 'tekton.dev/v1';
export const TRIGGERS_API = 'triggers.tekton.dev/v1beta1';
export const PIPELINE_RUN_API = 'tekton.dev/v1';

// Workspace names
export const WS_WORKSPACE = 'workspace';
export const WS_GIT_SOURCE = 'git-source';
export const WS_DOCKERCONFIG = 'dockerconfig';
export const WS_BASIC_AUTH    = 'basic-auth';
export const WS_SSH_DIRECTORY = 'ssh-directory';

// Param names
export const PARAM_GIT_URL = 'git-url';
export const PARAM_GIT_REVISION = 'git-revision';
export const PARAM_PROJECT_NAME = 'project-name';
export const PARAM_APP_ROOT = 'app-root';
export const PARAM_BUILD_PATH = 'build-path';
export const PARAM_GOLANG_VERSION = 'golang-version';
export const PARAM_GOLANG_VARIANT = 'golang-variant';
export const PARAM_IMAGE_NAME = 'image-name';

// Param names — SBOM / vuln / image tasks
export const PARAM_SCAN_TARGET = 'scan-target';
export const PARAM_SBOM_PATH = 'sbom-path';
export const PARAM_OUTPUT_FORMAT = 'output-format';
export const PARAM_IMAGE_DIGEST = 'image-digest';
export const PARAM_DOCKER_REPO = 'docker-repo';
export const PARAM_PATH_TO_APP_ROOT = 'path-to-app-root';

// Param defaults
export const DEFAULT_GOLANG_VERSION = '1.23.0';
export const DEFAULT_GOLANG_VARIANT = 'alpine';
export const DEFAULT_OUTPUT_FORMAT = 'cyclonedx-json';

// Trigger defaults
export const DEFAULT_SERVICE_ACCOUNT = 'tekton-triggers';
export const DEFAULT_WORKSPACE_STORAGE = '1Gi';
export const DEFAULT_APP_ROOT = 'src';
export const DEFAULT_BUILD_PATH = 'cmd';

export const GITHUB_REPO_URL = 'https://github.com/$(body.repository.full_name)';

// Pinned tool image versions
export const SYFT_IMAGE = 'anchore/syft:v1.11.0-debug';
export const GRYPE_IMAGE = 'anchore/grype:v0.79.6-debug';
export const CHAINGUARD_GIT_IMAGE = 'cgr.dev/chainguard/git:latest';

/**
 * Step-level security context injected as a stepTemplate default by TektonTaskConstruct.
 *
 * Covers the three PodSecurity "restricted" requirements that are safe to apply
 * universally. Omits runAsNonRoot so tasks whose images default to root
 * (e.g. golang:alpine) are not broken — those tasks run in namespaces without the
 * restricted policy.
 */
export const DEFAULT_STEP_SECURITY_CONTEXT = {
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] },
  seccompProfile: { type: 'RuntimeDefault' },
} as const;

/**
 * Full PodSecurity "restricted" step-level security context.
 *
 * Use this in tasks whose images are guaranteed to run as a non-root user
 * (e.g. cgr.dev/chainguard/git). Return it from buildTaskSpec() as the stepTemplate
 * to satisfy all four restricted requirements including runAsNonRoot.
 */
export const RESTRICTED_STEP_SECURITY_CONTEXT = {
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] },
  runAsNonRoot: true,
  seccompProfile: { type: 'RuntimeDefault' },
} as const;
