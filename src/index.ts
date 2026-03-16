// ─── Core API (Job/Pipeline DSL) ─────────────────────────────────────────────
export { Job } from './lib/core/job';
export type { JobOptions } from './lib/core/job';
export { JOBS } from './lib/core/jobs';
export { Pipeline } from './lib/core/pipeline';
export type { PipelineOptions } from './lib/core/pipeline';
export { TektonProject } from './lib/core/tekton-project';
export type { TektonProjectOptions } from './lib/core/tekton-project';
export { TRIGGER_EVENTS } from './lib/core/trigger-events';

// ─── Task Library ────────────────────────────────────────────────────────────
//   Base classes
export { PipelineTask } from './lib/tasks/pipeline-task';
export { TektonTaskConstruct } from './lib/tasks/tekton-task-construct';
export type { TektonTaskProps } from './lib/tasks/tekton-task-construct';
export { ImageDependentPipelineTask } from './lib/tasks/image-dependent-pipeline-task';

//   Inline tasks (Task resource + PipelineTask reference)
export { GoTestTask, GoTestPipelineTask } from './lib/tasks/go-test.task';
export type { GoTestPipelineTaskOptions } from './lib/tasks/go-test.task';
export { GoBuildTask, GoBuildPipelineTask } from './lib/tasks/go-build.task';
export type { GoBuildPipelineTaskOptions } from './lib/tasks/go-build.task';
export { GenerateSbomTask, GenerateSbomPipelineTask } from './lib/tasks/generate-sbom.task';
export type { GenerateSbomPipelineTaskOptions } from './lib/tasks/generate-sbom.task';
export { VulnScanTask, VulnScanPipelineTask } from './lib/tasks/vuln-scan.task';
export type { VulnScanPipelineTaskOptions } from './lib/tasks/vuln-scan.task';
export { GitLogTask, GitLogPipelineTask } from './lib/tasks/git-log.task';
export type { GitLogPipelineTaskOptions } from './lib/tasks/git-log.task';

//   External-ref tasks (PipelineTask only)
export { GitCloneTask, GitClonePipelineTask } from './lib/tasks/git-clone.task';
export type { GitClonePipelineTaskOptions } from './lib/tasks/git-clone.task';
export { KoBuildPipelineTask } from './lib/tasks/ko-build.task';
export type { KoBuildPipelineTaskOptions } from './lib/tasks/ko-build.task';
export { BuildOciPipelineTask } from './lib/tasks/build-oci.task';
export type { BuildOciPipelineTaskOptions } from './lib/tasks/build-oci.task';
export { FixFilePermsPipelineTask } from './lib/tasks/fix-file-perms.task';
export type { FixFilePermsPipelineTaskOptions } from './lib/tasks/fix-file-perms.task';
export { GenerateImageSbomPipelineTask } from './lib/tasks/generate-image-sbom.task';
export { CosignSignImagePipelineTask } from './lib/tasks/cosign-sign-image.task';

// ─── Pipeline Builder (advanced) ────────────────────────────────────────────
export { PipelineBuilder } from './lib/builder/pipeline-builder';
export type {
  PipelineBuildOptions,
  PipelineParamSpec,
  PipelineWorkspaceDeclaration,
  TaskFactory,
} from './lib/builder/pipeline-builder';

// ─── Triggers ────────────────────────────────────────────────────────────────
export { GitHubTriggerBase } from './lib/triggers/github-trigger-base';
export type { GitHubTriggerBaseProps, GitHubTriggerConfig } from './lib/triggers/github-trigger-base';
export { GitHubPushTrigger } from './lib/triggers/github-push.trigger';
export type { GitHubPushTriggerProps } from './lib/triggers/github-push.trigger';
export { GitHubPullRequestTrigger } from './lib/triggers/github-pull-request.trigger';
export type { GitHubPullRequestTriggerProps } from './lib/triggers/github-pull-request.trigger';

// ─── Infrastructure ──────────────────────────────────────────────────────────
export { TektonInfraChart } from './charts/tekton-infra.chart';
export type { TektonInfraChartProps } from './charts/tekton-infra.chart';

// ─── Constants, Params, Workspaces ───────────────────────────────────────────
export * from './lib/constants';
export * from './lib/params';
export * from './lib/workspaces';

// ─── Shared Types ────────────────────────────────────────────────────────────
// PipelineParamSpec and PipelineWorkspaceDeclaration are defined in ./types.ts
// and re-exported above via ./lib/builder/pipeline-builder for backward compat.
