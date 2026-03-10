// ─── Base classes ─────────────────────────────────────────────────────────────
export { PipelineTask } from './lib/tasks/pipeline-task';
export { TektonTaskConstruct } from './lib/tasks/tekton-task-construct';
export type { TektonTaskProps } from './lib/tasks/tekton-task-construct';
export { ImageDependentPipelineTask } from './lib/tasks/image-dependent-pipeline-task';

// ─── Task constructs (inline — Task resource + PipelineTask reference) ────────
export { GoTestTask, GoTestPipelineTask } from './lib/tasks/go-test.task';
export type { GoTestPipelineTaskOptions } from './lib/tasks/go-test.task';
export { GoBuildTask, GoBuildPipelineTask } from './lib/tasks/go-build.task';
export type { GoBuildPipelineTaskOptions } from './lib/tasks/go-build.task';
export { GenerateSbomTask, GenerateSbomPipelineTask } from './lib/tasks/generate-sbom.task';
export type { GenerateSbomPipelineTaskOptions } from './lib/tasks/generate-sbom.task';
export { VulnScanTask, VulnScanPipelineTask } from './lib/tasks/vuln-scan.task';
export type { VulnScanPipelineTaskOptions } from './lib/tasks/vuln-scan.task';

// ─── Task constructs (external refs — PipelineTask only) ─────────────────────
export { GitClonePipelineTask } from './lib/tasks/git-clone.task';
export type { GitClonePipelineTaskOptions } from './lib/tasks/git-clone.task';
export { KoBuildPipelineTask } from './lib/tasks/ko-build.task';
export type { KoBuildPipelineTaskOptions } from './lib/tasks/ko-build.task';
export { BuildOciPipelineTask } from './lib/tasks/build-oci.task';
export type { BuildOciPipelineTaskOptions } from './lib/tasks/build-oci.task';
export { FixFilePermsPipelineTask } from './lib/tasks/fix-file-perms.task';
export type { FixFilePermsPipelineTaskOptions } from './lib/tasks/fix-file-perms.task';
export { GenerateImageSbomPipelineTask } from './lib/tasks/generate-image-sbom.task';
export { CosignSignImagePipelineTask } from './lib/tasks/cosign-sign-image.task';

// ─── Pre-built pipelines ──────────────────────────────────────────────────────
export { GoPushPipeline } from './lib/pipelines/go-push.pipeline';
export type { GoPushPipelineProps } from './lib/pipelines/go-push.pipeline';
export { GoPullRequestPipeline } from './lib/pipelines/go-pull-request.pipeline';
export type { GoPullRequestPipelineProps } from './lib/pipelines/go-pull-request.pipeline';
export { ContainerImageBuildPipeline } from './lib/pipelines/container-image-build.pipeline';
export type { ContainerImageBuildPipelineProps } from './lib/pipelines/container-image-build.pipeline';
export { OciBuildPipeline } from './lib/pipelines/oci-build.pipeline';
export type { OciBuildPipelineProps } from './lib/pipelines/oci-build.pipeline';

// ─── Pipeline builder ─────────────────────────────────────────────────────────
export { PipelineBuilder } from './lib/builder/pipeline-builder';
export type {
  PipelineBuildOptions,
  PipelineParamSpec,
  PipelineWorkspaceDeclaration,
  TaskFactory,
} from './lib/builder/pipeline-builder';

// ─── Trigger infrastructure ───────────────────────────────────────────────────
export { GitHubTriggerBase } from './lib/triggers/github-trigger-base';
export type { GitHubTriggerBaseProps, GitHubTriggerConfig } from './lib/triggers/github-trigger-base';
export { GitHubPushTrigger } from './lib/triggers/github-push.trigger';
export type { GitHubPushTriggerProps } from './lib/triggers/github-push.trigger';
export { GitHubPullRequestTrigger } from './lib/triggers/github-pull-request.trigger';
export type { GitHubPullRequestTriggerProps } from './lib/triggers/github-pull-request.trigger';
export { TektonInfraChart } from './charts/tekton-infra.chart';
export type { TektonInfraChartProps } from './charts/tekton-infra.chart';

// ─── Constants, param specs, and workspace bindings ───────────────────────────
// Useful for authoring custom tasks and pipelines.
export * from './lib/constants';
export * from './lib/params';
export * from './lib/workspaces';
