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
   */
  createPendingTask(contexts: string[]): Task;

  /**
   * Returns a step that reports the final status of the given context.
   * The step reads the exit code from `/tekton/home/.exit-code` and reports
   * success or failure accordingly.
   *
   * Add this as the last step in any task that should report status.
   * The preceding work step must use `onError: 'continue'` and write its
   * exit code to `/tekton/home/.exit-code`.
   */
  finalStep(context: string): TaskStepSpec;

  /** Parameters required by this reporter (e.g., repo name, revision). */
  readonly requiredParams: Param[];
}
