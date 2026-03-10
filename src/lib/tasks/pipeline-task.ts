/**
 * Represents a single task entry within a Tekton Pipeline spec.
 *
 * Subclasses encapsulate the full step definition — taskRef, params,
 * workspaces — and accept runAfter as typed object references rather than
 * plain strings. Call toSpec() to get the serialisable YAML structure.
 */
export abstract class PipelineTask {
  abstract readonly name: string;
  protected readonly runAfter: PipelineTask[];

  constructor(runAfter: PipelineTask | PipelineTask[] = []) {
    this.runAfter = Array.isArray(runAfter) ? runAfter : [runAfter];
  }

  protected runAfterNames(): string[] {
    return this.runAfter.map(t => t.name);
  }

  protected buildSpec(spec: Record<string, unknown>): Record<string, unknown> {
    if (this.runAfter.length > 0) spec.runAfter = this.runAfterNames();
    return spec;
  }

  abstract toSpec(): Record<string, unknown>;
}
