/** Typed param spec for pipeline-level param declarations. */
export interface PipelineParamSpec {
  name: string;
  description?: string;
  type?: 'string' | 'array' | 'object';
  default?: string | string[];
}

/** Typed workspace declaration for pipeline-level workspace declarations. */
export interface PipelineWorkspaceDeclaration {
  name: string;
  description?: string;
  optional?: boolean;
}
