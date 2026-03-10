import { WS_WORKSPACE, WS_GIT_SOURCE, WS_DOCKERCONFIG } from './constants';

/**
 * Workspace binding constants for use in PipelineTask.toSpec() workspaces arrays.
 *
 * Each constant maps a task-level workspace name to the corresponding pipeline
 * workspace it is bound to at runtime.
 */

/** Binds task workspace 'workspace' → pipeline workspace 'workspace'. */
export const WORKSPACE_BINDING = { name: WS_WORKSPACE, workspace: WS_WORKSPACE } as const;

/** Binds task workspace 'source' → pipeline workspace 'git-source'. */
export const GIT_SOURCE_BINDING = { name: 'source', workspace: WS_GIT_SOURCE } as const;

/** Binds task workspace 'dockerconfig' → pipeline workspace 'dockerconfig'. */
export const DOCKERCONFIG_BINDING = { name: WS_DOCKERCONFIG, workspace: WS_DOCKERCONFIG } as const;
