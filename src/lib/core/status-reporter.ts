import { Task } from './task';
import type { TaskStepSpec } from './task';
import { Param } from './param';

/**
 * Provider-agnostic interface for reporting pipeline task statuses to an external system.
 *
 * Implementations supply:
 * - A factory to create the pending task that runs first in the pipeline
 * - A step that reports the final status (success/failure) at the end of each task
 */
export interface StatusReporter {
  /**
   * Creates a Task that sets all given contexts to "pending".
   * This task should run before any other task in the pipeline.
   *
   * `name` lets the caller scope the task name per pipeline, so multi-pipeline
   * projects (e.g. TektonicProject emitting one file per unique task name) don't
   * collide on a single shared `set-status-pending` task.
   */
  createPendingTask(contexts: string[], name?: string): Task;

  /**
   * Returns a step that reports the final status of the given context.
   * The step reads the captured exit code from {@link EXIT_CODE_PATH} and
   * reports success or failure accordingly.
   *
   * `TaskDef.synth` appends this as the last step and, for every preceding user
   * step, automatically enables exit-code capture and sets `onError: 'continue'`
   * — so the user body just exits naturally; no manual contract-file writes are
   * needed.
   *
   * `userStepNames` lists the task's user steps in order, so an implementation
   * can also consult Tekton's own per-step exit codes (see `stepExitCodePath`)
   * instead of trusting only the in-script contract file, which a body calling
   * the shell's `exit` bypasses. The framework's injected cache restore/save
   * steps are deliberately excluded from the list: they carry
   * `onError: 'continue'` of their own, and a failed cache save must not fail
   * the task.
   *
   * Optional so existing external implementations of {@link StatusReporter}
   * keep compiling.
   */
  finalStep(context: string, userStepNames?: string[]): TaskStepSpec;

  /**
   * Returns a Task (for the pipeline's `finally` block) that resolves any context left on
   * "pending" because its task was skipped by `when`. One step per entry, checking Tekton's
   * `$(tasks.<taskName>.status)`; no-ops when the task actually ran (its own {@link finalStep}
   * already reported it).
   *
   * Optional so existing external implementations of {@link StatusReporter} keep compiling —
   * pipelines simply skip skip-resolution when a reporter doesn't implement it.
   */
  createSkipResolverTask?(entries: { taskName: string; context: string }[], name?: string): Task;

  /** Parameters required by this reporter (e.g., repo name, revision). */
  readonly requiredParams: Param[];
}
