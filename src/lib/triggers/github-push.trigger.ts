import { Construct } from 'constructs';
import { GitHubTriggerBase, GitHubTriggerBaseProps } from './github-trigger-base';

export type GitHubPushTriggerProps = GitHubTriggerBaseProps;

/**
 * Composes a TriggerBinding and TriggerTemplate for GitHub push events.
 *
 * The binding extracts:
 *   gitrevision      - head commit SHA
 *   gitrepositoryurl - full HTTPS clone URL
 *   projectname      - repository name
 *   namespace        - target namespace (set to props.namespace)
 *
 * The template creates a PipelineRun referencing props.pipelineRef.
 *
 * Expose bindingRef / templateRef to wire into an EventListener trigger entry.
 */
export class GitHubPushTrigger extends GitHubTriggerBase {
  constructor(scope: Construct, id: string, props: GitHubPushTriggerProps) {
    super(scope, id, props, {
      bindingName: 'github-push',
      templateName: 'github-push-trigger-template',
      pipelineRunGenerateName: 'github-push-pipeline-run-',
      gitRevisionValue: '$(body.head_commit.id)',
    });
  }
}
