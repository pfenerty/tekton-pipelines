/**
 * Google Cloud Storage cache backend. Cache archives are stored in a GCS
 * bucket instead of a Kubernetes PVC. Authentication uses GKE Workload
 * Identity — the pod's Kubernetes Service Account must be annotated with
 * `iam.gke.io/gcp-service-account` pointing to a GCP SA that has
 * `roles/storage.objectAdmin` on the bucket.
 */
export interface GcsCacheBackend {
    type: "gcs";
    /** GCS bucket name (e.g. `'my-project-ci-cache'`). */
    bucket: string;
    /**
     * Optional key prefix within the bucket (e.g. `'tekton-cache/'`).
     * Useful for sharing a bucket across multiple projects or pipelines.
     * Defaults to `''`.
     */
    prefix?: string;
}

/**
 * Discriminated union of cache backend types.
 * When omitted from a {@link TaskCacheSpec}, the default PVC-based backend is used.
 */
export type CacheBackend = GcsCacheBackend;
