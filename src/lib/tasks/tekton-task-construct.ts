import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { TEKTON_API_V1, DEFAULT_STEP_SECURITY_CONTEXT } from '../constants';

export interface TektonTaskProps {
  namespace: string;
  name?: string;
  namePrefix?: string;
}

/**
 * Abstract base class for inline Tekton Task CDK8s constructs.
 *
 * Handles the shared boilerplate of creating a Tekton Task ApiObject
 * with the correct apiVersion, kind, metadata, and a spec provided by
 * the subclass via buildTaskSpec().
 */
export abstract class TektonTaskConstruct extends Construct {
  public readonly taskName: string;

  constructor(scope: Construct, id: string, props: TektonTaskProps, defaultName: string) {
    super(scope, id);
    this.taskName = props.name ?? (props.namePrefix ? `${props.namePrefix}-${defaultName}` : defaultName);

    new ApiObject(this, 'resource', {
      apiVersion: TEKTON_API_V1,
      kind: 'Task',
      metadata: {
        name: this.taskName,
        namespace: props.namespace,
      },
      spec: {
        stepTemplate: { securityContext: DEFAULT_STEP_SECURITY_CONTEXT },
        ...this.buildTaskSpec(),
      },
    });
  }

  protected abstract buildTaskSpec(): Record<string, unknown>;
}
