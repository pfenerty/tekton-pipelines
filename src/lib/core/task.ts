import { Construct } from "constructs";
import { ApiObject } from "cdk8s";
import {
    TEKTON_API_V1,
    DEFAULT_STEP_SECURITY_CONTEXT,
    DEFAULT_STEP_RESOURCES,
    DEFAULT_BASE_IMAGE,
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
    /**
     * Files (relative to workingDir) whose combined content determines the cache key.
     * An empty array produces a fixed hash, meaning the cache always hits after the
     * first run — useful for tool-managed caches like vulnerability databases.
     */
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
    /**
     * zstd compression level (1–19). Lower levels are faster and use less memory.
     * Level 1 uses ~1 MB working memory and still achieves ~2.5× compression.
     * Only applies when `compress` is `true`. Defaults to `1`.
     */
    compressionLevel?: number;
    /**
     * Explicit `computeResources` for the injected cache restore and save steps,
     * overriding the stepTemplate default. Useful for constraining memory when the
     * build step consumes most of the node's RAM.
     */
    computeResources?: {
        requests?: { cpu?: string; memory?: string };
        limits?: { cpu?: string; memory?: string };
    };
    /**
     * Maximum number of cache archive entries to keep per workspace. During save,
     * entries older than the newest `maxEntries` are deleted. Defaults to `3`.
     * Set to `0` to disable eviction.
     */
    maxEntries?: number;
    /**
     * Strategy for running the cache save step.
     *
     * - `"step"` (default) — save runs as a step within the build pod. Fastest,
     *   but shares node memory with the build steps; can cause OOM on memory-
     *   intensive builds (e.g. large Go projects on constrained nodes).
     *
     * - `"finally"` — save runs as a separate Tekton *finally* task in its own
     *   pod. The build pod is fully terminated (and its memory reclaimed) before
     *   compression starts. Adds ~10–15 s scheduling overhead.
     */
    saveStrategy?: "step" | "finally";
    /**
     * Always overwrite the cache archive on save, even if one already exists
     * for the current hash. Use this for tool-managed caches where the tool
     * updates its data in-place (e.g. grype vulnerability database).
     * Defaults to `false`.
     */
    forceSave?: boolean;
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

    /** Returns the hash-file path for the given cache spec. */
    private static _hashFilePath(c: TaskCacheSpec, taskName?: string): string {
        const wsPath = `$(workspaces.${c.workspace.name}.path)`;
        if (c.saveStrategy === "finally") {
            // Write to the cache PVC so it survives across pods.
            return `${wsPath}/.cache-hash${taskName ? `-${taskName}` : ""}`;
        }
        // Pod-local path (default).
        return `/tekton/home/.cache-${c.workspace.name}-hash`;
    }

    private static _makeCacheRestoreStep(
        c: TaskCacheSpec,
        taskName?: string,
    ): TaskStepSpec {
        const wsName = c.workspace.name;
        const wsPath = `$(workspaces.${wsName}.path)`;
        const hashFile = Task._hashFilePath(c, taskName);
        const keyFiles = c.key.join(" ");
        let script: string;
        if (c.compress) {
            let hashExpr: string;
            if (c.key.length === 0) {
                // Static hash — always the same key, always hits after the first run.
                hashExpr = `let hash = ("" | hash sha256 | str substring 0..15)`;
            } else {
                const keyFileList = c.key.map((f) => `"${f}"`).join(", ");
                hashExpr = `let hash = (
  [${keyFileList}]
  | each { |f| if ($f | path exists) { open --raw $f } else { "" } }
  | str join | hash sha256 | str substring 0..15
)`;
            }
            script = `#!/usr/bin/env nu
def log [msg: string] {
  print $"[(date now | format date '%H:%M:%S')] cache-restore-${wsName}: ($msg)"
}

${hashExpr}
$hash | save -f ${hashFile}
let archive = $"${wsPath}/($hash).tar.zst"

if ($archive | path exists) {
  let size = (ls $archive | get size.0)
  log $"hit ($hash) archive=($archive) size=($size)"
  ^zstd -d -T1 -c $archive | ^tar xf -
  log "restored"
} else {
  log $"miss ($hash) archive=($archive)"
}`;
        } else {
            const copyPaths = c.paths
                .map(
                    (p) =>
                        `  [ -e "$CACHE_DIR/${p}" ] && cp -r "$CACHE_DIR/${p}" "./${p}" || true`,
                )
                .join("\n");
            const hashCmd =
                c.key.length === 0
                    ? `HASH=$(echo -n "" | sha256sum | cut -c1-16)`
                    : `HASH=$(cat ${keyFiles} | sha256sum | cut -c1-16)`;
            script = `#!/bin/sh
set -e
${hashCmd}
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
            image: c.image ?? DEFAULT_BASE_IMAGE,
            script,
            ...(c.workingDir ? { workingDir: c.workingDir } : {}),
            ...(c.computeResources
                ? { computeResources: c.computeResources }
                : {}),
        };
    }

    private static _makeCacheSaveStep(
        c: TaskCacheSpec,
        taskName?: string,
    ): TaskStepSpec {
        const wsName = c.workspace.name;
        const wsPath = `$(workspaces.${wsName}.path)`;
        const hashFile = Task._hashFilePath(c, taskName);
        const compressionLevel = c.compressionLevel ?? 1;
        const maxEntries = c.maxEntries ?? 3;
        const forceSave = c.forceSave ?? false;
        let script: string;
        if (c.compress) {
            const pathList = c.paths.map((p) => `"${p}"`).join(", ");
            const skipExisting = forceSave
                ? ""
                : `if ($archive | path exists) { log $"($hash) exists, skipping"; exit 0 }\n`;
            script = `#!/usr/bin/env nu
def log [msg: string] {
  print $"[(date now | format date '%H:%M:%S')] cache-save-${wsName}: ($msg)"
}

let hash = (try { open --raw ${hashFile} | str trim } catch { "" })
if ($hash | is-empty) { log "no hash, skipping"; exit 0 }

let archive = $"${wsPath}/($hash).tar.zst"
${skipExisting}
let paths = [${pathList}] | where { |p| ($p | path exists) }
if ($paths | is-empty) { log "no paths to cache"; exit 0 }

# Evict old entries
let max = ${maxEntries}
if $max > 0 {
  let entries = (try { ls ${wsPath}/*.tar.zst | sort-by modified | reverse | skip $max } catch { [] })
  for e in $entries { log $"evicting ($e.name | path basename)"; rm $e.name }
}

log $"saving ($hash) ..."
^tar cf - ...$paths | ^zstd -${compressionLevel} -T1${forceSave ? " -f" : ""} -o $archive

let size = (ls $archive | get size.0)
log $"saved archive=($archive) size=($size)"`;
        } else {
            const copyPaths = c.paths
                .map((p) => `  cp -r "./${p}" "$CACHE_DIR/${p}"`)
                .join("\n");
            const saveCondition = forceSave
                ? `echo "saving cache ($HASH)"\n  mkdir -p "$CACHE_DIR"\n${copyPaths}`
                : `if [ ! -d "$CACHE_DIR" ]; then\n  echo "saving cache ($HASH)"\n  mkdir -p "$CACHE_DIR"\n${copyPaths}\nfi`;
            script = `#!/bin/sh
HASH=$(cat ${hashFile} 2>/dev/null || echo "")
[ -z "$HASH" ] && exit 0
CACHE_DIR="${wsPath}/$HASH"
${saveCondition}`;
        }
        return {
            name: `cache-save-${wsName}`,
            image: c.image ?? DEFAULT_BASE_IMAGE,
            script,
            onError: "continue" as const,
            ...(c.workingDir ? { workingDir: c.workingDir } : {}),
            ...(c.computeResources
                ? { computeResources: c.computeResources }
                : {}),
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
        const restoreSteps = this.caches.map((c) =>
            Task._makeCacheRestoreStep(c, this.name),
        );
        const saveSteps = this.caches
            .filter((c) => c.saveStrategy !== "finally")
            .map((c) => Task._makeCacheSaveStep(c, this.name));
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

    /**
     * Returns standalone Task objects for caches that use `saveStrategy: "finally"`.
     * These tasks are intended to be wired into the pipeline's `finally` block so
     * they run in their own pod after the build pod has terminated.
     */
    getCacheFinallyTasks(): Task[] {
        return this.caches
            .filter((c) => c.saveStrategy === "finally")
            .map(
                (c) =>
                    new Task({
                        name: `cache-save-${c.workspace.name}-${this.name}`,
                        workspaces: [
                            c.workspace,
                            ...this.workspaces.filter(
                                (w) => w.name !== c.workspace.name,
                            ),
                        ],
                        steps: [Task._makeCacheSaveStep(c, this.name)],
                        stepTemplate: this.stepTemplate,
                    }),
            );
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
