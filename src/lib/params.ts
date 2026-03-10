import {
  PARAM_GOLANG_VERSION,
  PARAM_GOLANG_VARIANT,
  DEFAULT_GOLANG_VERSION,
  DEFAULT_GOLANG_VARIANT,
} from './constants';

/**
 * Reusable full param spec objects for use in both Task buildTaskSpec() and
 * Pipeline spec.params arrays. Using these shared constants ensures that the
 * name, description, type, and default are always in sync across all consumers.
 */

/** golang-version param spec — identical across GoTestTask, GoBuildTask, and both Go pipelines. */
export const GOLANG_VERSION_PARAM_SPEC = {
  name: PARAM_GOLANG_VERSION,
  description: 'golang version to use for the build',
  type: 'string',
  default: DEFAULT_GOLANG_VERSION,
} as const;

/** golang-variant param spec — identical across GoTestTask, GoBuildTask, and both Go pipelines. */
export const GOLANG_VARIANT_PARAM_SPEC = {
  name: PARAM_GOLANG_VARIANT,
  description: 'golang image variant to use for the build',
  type: 'string',
  default: DEFAULT_GOLANG_VARIANT,
} as const;
