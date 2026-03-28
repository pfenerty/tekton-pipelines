import type { TaskCacheSpec } from "../core/task";
import type { Workspace } from "../core/workspace";

/** Common options shared by all cache preset factory functions. */
export interface CachePresetOptions {
    /** Workspace (PVC) where cache archives are stored. */
    workspace: Workspace;
    /** Override the default cache step image. */
    image?: string;
    /** Working directory for cache steps (e.g. `$(workspaces.workspace.path)`). */
    workingDir?: string;
    /** zstd compression level (1–19). Defaults vary per preset. */
    compressionLevel?: number;
    /** Max cache entries to keep. Defaults to `3`. */
    maxEntries?: number;
    /** `"step"` (default for most) or `"finally"` (default for Go). */
    saveStrategy?: "step" | "finally";
    /** Explicit computeResources for cache steps. */
    computeResources?: TaskCacheSpec["computeResources"];
}

/**
 * Cache preset for Go module and build caches.
 *
 * Caches `go-mod/` and `go-build/` relative to `workingDir`. You **must**
 * set the following environment variables in your Go build steps so the
 * caches land in the workspace rather than container-local paths:
 *
 * ```ts
 * env: [
 *   { name: 'GOMODCACHE', value: '$(workspaces.workspace.path)/go-mod' },
 *   { name: 'GOCACHE',    value: '$(workspaces.workspace.path)/go-build' },
 * ]
 * ```
 *
 * Defaults to `saveStrategy: "finally"` because Go builds are memory-
 * intensive and compressing the cache in the same pod often causes OOM
 * on constrained nodes.
 */
export function goModuleCache(opts: CachePresetOptions): TaskCacheSpec {
    return {
        key: ["go.sum"],
        paths: ["go-mod", "go-build"],
        workspace: opts.workspace,
        compress: true,
        compressionLevel: opts.compressionLevel ?? 1,
        saveStrategy: opts.saveStrategy ?? "finally",
        maxEntries: opts.maxEntries ?? 3,
        ...(opts.image ? { image: opts.image } : {}),
        ...(opts.workingDir ? { workingDir: opts.workingDir } : {}),
        ...(opts.computeResources
            ? { computeResources: opts.computeResources }
            : {}),
    };
}

/**
 * Cache preset for npm `node_modules`.
 *
 * Key file: `package-lock.json`. Cached path: `node_modules`.
 */
export function npmCache(opts: CachePresetOptions): TaskCacheSpec {
    return {
        key: ["package-lock.json"],
        paths: ["node_modules"],
        workspace: opts.workspace,
        compress: true,
        compressionLevel: opts.compressionLevel ?? 1,
        saveStrategy: opts.saveStrategy ?? "step",
        maxEntries: opts.maxEntries ?? 3,
        ...(opts.image ? { image: opts.image } : {}),
        ...(opts.workingDir ? { workingDir: opts.workingDir } : {}),
        ...(opts.computeResources
            ? { computeResources: opts.computeResources }
            : {}),
    };
}

/**
 * Cache preset for Maven local repository.
 *
 * Key file: `pom.xml`. Cached path: `.m2/repository`.
 * Set `-Dmaven.repo.local=.m2/repository` in your Maven steps.
 */
export function mavenCache(opts: CachePresetOptions): TaskCacheSpec {
    return {
        key: ["pom.xml"],
        paths: [".m2/repository"],
        workspace: opts.workspace,
        compress: true,
        compressionLevel: opts.compressionLevel ?? 1,
        saveStrategy: opts.saveStrategy ?? "step",
        maxEntries: opts.maxEntries ?? 3,
        ...(opts.image ? { image: opts.image } : {}),
        ...(opts.workingDir ? { workingDir: opts.workingDir } : {}),
        ...(opts.computeResources
            ? { computeResources: opts.computeResources }
            : {}),
    };
}

/**
 * Cache preset for Gradle caches and wrapper.
 *
 * Key files: `gradle/wrapper/gradle-wrapper.properties`, `build.gradle`,
 * `build.gradle.kts`, `settings.gradle`, `settings.gradle.kts`.
 * Cached paths: `.gradle/caches`, `.gradle/wrapper`.
 * Set `GRADLE_USER_HOME=.gradle` in your Gradle steps.
 */
export function gradleCache(opts: CachePresetOptions): TaskCacheSpec {
    return {
        key: [
            "gradle/wrapper/gradle-wrapper.properties",
            "build.gradle",
            "build.gradle.kts",
            "settings.gradle",
            "settings.gradle.kts",
        ],
        paths: [".gradle/caches", ".gradle/wrapper"],
        workspace: opts.workspace,
        compress: true,
        compressionLevel: opts.compressionLevel ?? 1,
        saveStrategy: opts.saveStrategy ?? "step",
        maxEntries: opts.maxEntries ?? 3,
        ...(opts.image ? { image: opts.image } : {}),
        ...(opts.workingDir ? { workingDir: opts.workingDir } : {}),
        ...(opts.computeResources
            ? { computeResources: opts.computeResources }
            : {}),
    };
}
