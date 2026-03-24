import { Construct } from 'constructs';
import { GitHubTriggerBase, GitHubTriggerBaseProps } from './github-trigger-base';

/** Props for {@link GitHubTagTrigger}. Identical to {@link GitHubTriggerBaseProps}. */
export type GitHubTagTriggerProps = GitHubTriggerBaseProps;

/** Trigger that fires on GitHub tag push events. Extracts revision from `body.ref`. */
export class GitHubTagTrigger extends GitHubTriggerBase {
  constructor(scope: Construct, id: string, props: GitHubTagTriggerProps) {
    super(scope, id, props, {
      bindingName: 'github-tag',
      templateName: 'github-tag-trigger-template',
      pipelineRunGenerateName: 'github-tag-pipeline-run-',
      gitRevisionValue: '$(body.ref)',
    });
  }
}
