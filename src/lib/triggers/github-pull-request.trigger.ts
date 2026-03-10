import { Construct } from 'constructs';
import { GitHubTriggerBase, GitHubTriggerBaseProps } from './github-trigger-base';

export type GitHubPullRequestTriggerProps = GitHubTriggerBaseProps;

/**
 * Composes a TriggerBinding and TriggerTemplate for GitHub pull_request events.
 *
 * The binding extracts:
 *   gitrevision      - PR head SHA
 *   gitrepositoryurl - full HTTPS clone URL
 *   projectname      - repository name
 *   namespace        - target namespace (set to props.namespace)
 *
 * The template creates a PipelineRun referencing props.pipelineRef.
 *
 * Expose bindingRef / templateRef to wire into an EventListener trigger entry.
 */
export class GitHubPullRequestTrigger extends GitHubTriggerBase {
  constructor(scope: Construct, id: string, props: GitHubPullRequestTriggerProps) {
    super(scope, id, props, {
      bindingName: 'github-pull-request',
      templateName: 'github-pull-request-trigger-template',
      pipelineRunGenerateName: 'github-pull-request-pipeline-run-',
      gitRevisionValue: '$(body.pull_request.head.sha)',
    });
  }
}
