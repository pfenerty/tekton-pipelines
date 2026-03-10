export const TEKTON_API_V1 = 'tekton.dev/v1';
export const TRIGGERS_API = 'triggers.tekton.dev/v1beta1';
export const PIPELINE_RUN_API = 'tekton.dev/v1beta1';

// Workspace names
export const WS_WORKSPACE = 'workspace';
export const WS_GIT_SOURCE = 'git-source';
export const WS_DOCKERCONFIG = 'dockerconfig';

// Param names
export const PARAM_GIT_URL = 'git-url';
export const PARAM_GIT_REVISION = 'git-revision';
export const PARAM_PROJECT_NAME = 'project-name';
export const PARAM_APP_ROOT = 'app-root';
export const PARAM_BUILD_PATH = 'build-path';
export const PARAM_GOLANG_VERSION = 'golang-version';
export const PARAM_GOLANG_VARIANT = 'golang-variant';
export const PARAM_IMAGE_NAME = 'image-name';

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
