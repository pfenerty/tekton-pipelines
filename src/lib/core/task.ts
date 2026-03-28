import { Construct } from "constructs";
import { ApiObject } from "cdk8s";
import {
    TEKTON_API_V1,
    DEFAULT_STEP_SECURITY_CONTEXT,
    DEFAULT_STEP_RESOURCES,
} from "../constants";
import { Param } from "./param";
import { Workspace } from "./workspace";
import type { StatusReporter } from "./status-reporter";

/** Specification for a single step within a Tekton Task. */
export interface TaskStepSpec {
    /** Step name (must be unique within the task). */
    name: string;
    /** Container image to run for this step. */
    image: string;
    /** Entrypoint command override. */
    command?: string[];
    /** Arguments passed to the entrypoint. */
    args?: string[];
    /** Inline script executed by the step. */
    script?: string;
    /** Working directory for the step. */
    workingDir?: string;
    /** Environment variables injected into the step container. */
    env?: {
        name: string;
        value?: string;
        valueFrom?: { secretKeyRef: { name: string; key: string } };
    }[];
    /** Controls behaviour when this step fails. `continue` lets subsequent steps run. */
    onError?: "continue" | "stopAndFail";
    /** CPU/memory requests and limits for this step (overrides stepTemplate computeResources). */
    computeResources?: {
        requests?: { cpu?: string; memory?: string };
        limits?: { cpu?: string; memory?: string };
    };
    /** Per-step container securityContext override. Applied on top of the task stepTemplate. */
    securityContext?: Record<string, unknown>;
}

/**
 * Declares a cache entry for a task. The library injects restore and save
 * steps automatically around the user's steps, following the same hash-based
 * hit/miss strategy as GitLab CI's `cache:` keyword.
 */
export interface TaskCacheSpec {
    /** Files (relative to workingDir) whose combined content determines the cache key. */
    key: string[];
    /** Paths (relative to workingDir) to restore on hit and save on miss. */
    paths: string[];
    /** Workspace (PVC) where cache entries are stored. Auto-added to task workspaces if absent. */
    workspace: Workspace;
    /** Image for the injected restore/save steps. Defaults to `'alpine'`. */
    image?: string;
    /**
     * Compress the cache into a single zstd archive (`.tar.zst`) instead of copying
     * path trees directly. Reduces NFS I/O from thousands of file operations to one
     * read/write. Requires the step image to have `tar` with `--zstd` support and nushell.
     */
    compress?: boolean;
    /**
     * Working directory for the injected restore and save steps. Paths in `key` and
     * `paths` are resolved relative to this directory. Typically set to the Tekton
     * workspace expression, e.g. `$(workspaces.workspace.path)`.
     */
    workingDir?: string;
}

/** Options for constructing a {@link Task}. */
export interface TaskOptions {
    /** Task name used in Tekton manifests and pipeline task references. */
    name: string;
    /** Parameters accepted by this task. */
    params?: Param[];
    /** Workspaces required by this task. */
    workspaces?: Workspace[];
    /** Ordered list of steps the task executes. */
    steps: TaskStepSpec[];
    /** Tasks that must complete before this task runs (dependency graph edges). */
    needs?: Task[];
    /** Override or extend the default step template (merged with security context defaults). */
    stepTemplate?: Record<string, unknown>;
    /**
     * Status context string reported to the external system (e.g. `"ci/test"`).
     * When set together with `statusReporter`, the reporter's `finalStep` is
     * automatically appended to this task's steps at synthesis time.
     */
    statusContext?: string;
    /** Reporter used to generate the final-status step for this task. */
    statusReporter?: StatusReporter;
    /**
     * Cache declarations for this task. For each entry the library injects a
     * restore step before the user's steps and a save step after them.
     * The cache workspace is auto-registered if not already in `workspaces`.
     */
    caches?: TaskCacheSpec[];
}

/**
 * A Tekton Task definition.
 *
 * Tasks are the unit of work in a Tekton pipeline. Each task declares its
 * params, workspaces, and steps. The {@link needs} array defines the dependency
 * graph — pipelines automatically discover transitive dependencies and set
 * `runAfter` ordering.
 *
 * All steps inherit a secure-by-default `stepTemplate` that drops all
 * capabilities and enables seccomp. Override via the `stepTemplate` option.
 */
export class Task {
    readonly name: string;
    readonly params: Param[];
    readonly workspaces: Workspace[];
    readonly steps: TaskStepSpec[];
    /** Tasks that must complete before this task runs. */
    readonly needs: Task[];
    readonly stepTemplate?: Record<string, unknown>;
    /** Status context reported to the external system. */
    readonly statusContext?: string;
    /** Reporter that generates the final-status step. */
    readonly statusReporter?: StatusReporter;
    /** Cache declarations — restore/save steps are injected at synthesis time. */
    readonly caches: TaskCacheSpec[];

    constructor(opts: TaskOptions) {
        this.name = opts.name;
        // Auto-merge statusReporter.requiredParams into task params (user params take precedence)
        const base = opts.params ?? [];
        const reporterParams = opts.statusReporter?.requiredParams ?? [];
        const seen = new Map<string, Param>();
        for (const p of [...base, ...reporterParams]) {
            if (!seen.has(p.name)) seen.set(p.name, p);
        }
        this.params = [...seen.values()];
        this.workspaces = [...(opts.workspaces ?? [])];
        this.steps = opts.steps;
        this.needs = opts.needs ?? [];
        this.stepTemplate = opts.stepTemplate;
        this.statusContext = opts.statusContext ?? opts.name;
        this.statusReporter = opts.statusReporter;
        this.caches = opts.caches ?? [];
        // Auto-register each cache's workspace if not already present
        for (const c of this.caches) {
            if (!this.workspaces.some((w) => w.name === c.workspace.name)) {
                (this.workspaces as Workspace[]).push(c.workspace);
            }
        }
    }

    private static _makeCacheRestoreStep(c: TaskCacheSpec): TaskStepSpec {
        const wsName = c.workspace.name;
        const wsPath = `$(workspaces.${wsName}.path)`;
        const hashFile = `/tekton/home/.cache-${wsName}-hash`;
        const keyFiles = c.key.join(" ");
        let script: string;
        if (c.compress) {
            const keyFileList = c.key.map(f => `"${f}"`).join(", ");
            script = `#!/usr/bin/env nu
let hash = ([${keyFileList}] | each { |f| open --raw $f } | bytes collect | hash sha256 | str substring 0..15)
$hash | save -f ${hashFile}
let archive = $"${wsPath}/($hash).tar.zst"
if ($archive | path exists) {
  print $"cache hit ($hash)"
  ^tar --zstd -xf $archive
} else {
  print $"cache miss ($hash)"
}`;
        } else {
            const copyPaths = c.paths
                .map(
                    (p) =>
                        `  [ -e "$CACHE_DIR/${p}" ] && cp -r "$CACHE_DIR/${p}" "./${p}" || true`,
                )
                .join("\n");
            script = `#!/bin/sh
set -e
HASH=$(cat ${keyFiles} | sha256sum | cut -c1-16)
echo "$HASH" > ${hashFile}
CACHE_DIR="${wsPath}/$HASH"
if [ -d "$CACHE_DIR" ]; then
  echo "cache hit ($HASH)"
${copyPaths}
else
  echo "cache miss ($HASH)"
fi`;
        }
        return {
            name: `cache-restore-${wsName}`,
            image: c.image ?? "alpine",
            script,
            ...(c.workingDir ? { workingDir: c.workingDir } : {}),
        };
    }

    private static _makeCacheSaveStep(c: TaskCacheSpec): TaskStepSpec {
        const wsName = c.workspace.name;
        const wsPath = `$(workspaces.${wsName}.path)`;
        const hashFile = `/tekton/home/.cache-${wsName}-hash`;
        let script: string;
        if (c.compress) {
            const archivePaths = c.paths.join(" ");
            script = `#!/usr/bin/env nu
let hash = (try { open --raw ${hashFile} | str trim } catch { "" })
if ($hash | str length) == 0 { exit 0 }
let archive = $"${wsPath}/($hash).tar.zst"
if not ($archive | path exists) {
  print $"saving cache ($hash)"
  ^tar --zstd -cf $archive ${archivePaths}
}`;
        } else {
            const copyPaths = c.paths
                .map((p) => `  cp -r "./${p}" "$CACHE_DIR/${p}"`)
                .join("\n");
            script = `#!/bin/sh
HASH=$(cat ${hashFile} 2>/dev/null || echo "")
[ -z "$HASH" ] && exit 0
CACHE_DIR="${wsPath}/$HASH"
if [ ! -d "$CACHE_DIR" ]; then
  echo "saving cache ($HASH)"
  mkdir -p "$CACHE_DIR"
${copyPaths}
fi`;
        }
        return {
            name: `cache-save-${wsName}`,
            image: c.image ?? "alpine",
            script,
            onError: "continue" as const,
            ...(c.workingDir ? { workingDir: c.workingDir } : {}),
        };
    }

    /**
     * Synthesizes the Tekton Task resource into the given cdk8s scope.
     *
     * @param stepSecurityContext - Additional container-level security context fields merged on
     *   top of `DEFAULT_STEP_SECURITY_CONTEXT`. Supplied by `TektonProject` from the project's
     *   `defaultStepSecurityContext` option. The task's own `stepTemplate.securityContext` (if
     *   any) takes precedence over this via the spread in stepTemplate.
     */
    synth(
        scope: Construct,
        namespace: string,
        namePrefix?: string,
        stepSecurityContext?: Record<string, unknown>,
    ): void {
        const resourceName = namePrefix
            ? `${namePrefix}-${this.name}`
            : this.name;
        const baseStepSecContext = {
            ...DEFAULT_STEP_SECURITY_CONTEXT,
            ...(stepSecurityContext ?? {}),
        };
        const restoreSteps = this.caches.map(Task._makeCacheRestoreStep);
        const saveSteps = this.caches.map(Task._makeCacheSaveStep);
        const reporterStep =
            this.statusReporter && this.statusContext
                ? [this.statusReporter.finalStep(this.statusContext)]
                : [];
        const allSteps = [
            ...restoreSteps,
            ...this.steps,
            ...saveSteps,
            ...reporterStep,
        ];
        const steps = allSteps.map((s) => {
            const { securityContext, ...rest } = s as TaskStepSpec;
            return securityContext ? { ...rest, securityContext } : rest;
        });
        new ApiObject(scope, this.name, {
            apiVersion: TEKTON_API_V1,
            kind: "Task",
            metadata: { name: resourceName, namespace },
            spec: {
                stepTemplate: {
                    securityContext: baseStepSecContext,
                    computeResources: DEFAULT_STEP_RESOURCES,
                    ...(this.stepTemplate ?? {}),
                },
                ...(this.params.length > 0 && {
                    params: this.params.map((p) => p.toSpec()),
                }),
                ...(this.workspaces.length > 0 && {
                    workspaces: this.workspaces.map((w) => w.toSpec()),
                }),
                steps,
            },
        });
    }

    /** @internal Generates the pipeline task spec used inside a Pipeline resource. */
    _toPipelineTaskSpec(
        runAfterNames: string[],
        namePrefix?: string,
    ): Record<string, unknown> {
        const taskRefName = namePrefix
            ? `${namePrefix}-${this.name}`
            : this.name;
        const spec: Record<string, unknown> = {
            name: this.name,
            taskRef: { kind: "Task", name: taskRefName },
        };
        if (this.params.length > 0) {
            spec.params = this.params.map((p) => ({
                name: p.name,
                value: p.pipelineExpression ?? `$(params.${p.name})`,
            }));
        }
        if (this.workspaces.length > 0) {
            spec.workspaces = this.workspaces.map((w) => ({
                name: w.name,
                workspace: w.name,
            }));
        }
        if (runAfterNames.length > 0) {
            spec.runAfter = runAfterNames;
        }
        return spec;
    }
}
