import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { GitClonePipelineTask } from '../tasks/git-clone.task';
import { GoTestPipelineTask } from '../tasks/go-test.task';
import { GenerateSbomPipelineTask } from '../tasks/generate-sbom.task';
import { VulnScanPipelineTask } from '../tasks/vuln-scan.task';

export interface GoPullRequestPipelineProps {
  namespace: string;
  name?: string;
}

/**
 * Pipeline triggered on pull request events: clones, tests, generates an SBOM,
 * and runs a vulnerability scan.
 *
 * Tasks:
 *   clone              - git-clone (Tekton catalog resolver)
 *   test               - go-test task           (runs after clone)
 *   generate-sbom      - generate-sbom task      (runs after clone, parallel with test)
 *   vulnerability-scan - vulnerability-scan task (runs after generate-sbom)
 *
 * Params exposed at runtime:
 *   git-url        - repository URL
 *   git-revision   - commit SHA / branch
 *   project-name   - repository name
 *   app-root       - path to Go module root (contains go.mod)
 *   build-path     - path under app-root to test
 *   golang-version - Go toolchain version (default: 1.23.0)
 *   golang-variant - base image variant (default: alpine)
 */
export class GoPullRequestPipeline extends Construct {
  public readonly pipelineName: string;

  constructor(scope: Construct, id: string, props: GoPullRequestPipelineProps) {
    super(scope, id);
    this.pipelineName = props.name ?? 'go-merge-request';

    const clone = new GitClonePipelineTask();
    const test = new GoTestPipelineTask({ runAfter: clone });
    const sbom = new GenerateSbomPipelineTask({ runAfter: clone });
    const vuln = new VulnScanPipelineTask({ runAfter: sbom });

    new ApiObject(this, 'resource', {
      apiVersion: 'tekton.dev/v1',
      kind: 'Pipeline',
      metadata: {
        name: this.pipelineName,
        namespace: props.namespace,
      },
      spec: {
        params: [
          { name: 'git-url', type: 'string' },
          { name: 'git-revision', type: 'string' },
          { name: 'project-name', type: 'string' },
          {
            name: 'app-root',
            description: 'path to root of the golang app (should contain go.mod, go.sum files)',
            type: 'string',
          },
          {
            name: 'build-path',
            description: 'path under app-root to target for build',
            type: 'string',
          },
          {
            name: 'golang-version',
            description: 'golang version to use for the build',
            type: 'string',
            default: '1.23.0',
          },
          {
            name: 'golang-variant',
            description: 'golang image variant to use for the build',
            type: 'string',
            default: 'alpine',
          },
        ],
        workspaces: [{ name: 'workspace' }],
        tasks: [clone, test, sbom, vuln].map(t => t.toSpec()),
      },
    });
  }
}
