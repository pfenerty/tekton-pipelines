import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { GoTestTask } from '../tasks/go-test.task';
import { GenerateSbomTask } from '../tasks/generate-sbom.task';
import { VulnScanTask } from '../tasks/vuln-scan.task';

export interface GoPullRequestPipelineProps {
  namespace: string;
  name?: string;
  /** Name of the test-go Task. Defaults to GoTestTask.defaultName. */
  testTaskName?: string;
  /** Name of the generate-sbom Task. Defaults to GenerateSbomTask.defaultName. */
  sbomTaskName?: string;
  /** Name of the vulnerability-scan Task. Defaults to VulnScanTask.defaultName. */
  vulnScanTaskName?: string;
}

/**
 * Pipeline triggered on pull request events: clones, tests, generates an SBOM,
 * and runs a vulnerability scan.
 *
 * Tasks:
 *   clone            - git-clone (Tekton catalog resolver)
 *   test             - test-go task      (runs after clone)
 *   generate-sbom    - generate-sbom task (runs after clone, parallel with test)
 *   vulnerability-scan - vuln-scan task  (runs after generate-sbom)
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
    const testTaskName = props.testTaskName ?? GoTestTask.defaultName;
    const sbomTaskName = props.sbomTaskName ?? GenerateSbomTask.defaultName;
    const vulnScanTaskName = props.vulnScanTaskName ?? VulnScanTask.defaultName;

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
        tasks: [
          {
            name: 'clone',
            taskRef: {
              resolver: 'git',
              params: [
                { name: 'url', value: 'https://github.com/tektoncd/catalog.git' },
                { name: 'pathInRepo', value: '/task/git-clone/0.9/git-clone.yaml' },
                { name: 'revision', value: 'main' },
              ],
            },
            params: [
              { name: 'url', value: '$(params.git-url)' },
              { name: 'revision', value: '$(params.git-revision)' },
            ],
            workspaces: [{ name: 'output', workspace: 'workspace' }],
          },
          {
            name: 'test',
            runAfter: ['clone'],
            taskRef: { kind: 'Task', name: testTaskName },
            params: [
              { name: 'build-path', value: '$(params.app-root)/$(params.build-path)' },
              { name: 'golang-version', value: '$(params.golang-version)' },
              { name: 'golang-variant', value: '$(params.golang-variant)' },
            ],
            workspaces: [{ name: 'workspace', workspace: 'workspace' }],
          },
          {
            name: 'generate-sbom',
            runAfter: ['clone'],
            taskRef: { kind: 'Task', name: sbomTaskName },
            params: [
              {
                name: 'scan-target',
                value: '$(workspaces.workspace.path)/$(params.app-root)',
              },
            ],
            workspaces: [{ name: 'workspace', workspace: 'workspace' }],
          },
          {
            name: 'vulnerability-scan',
            runAfter: ['generate-sbom'],
            taskRef: { kind: 'Task', name: vulnScanTaskName },
            params: [
              { name: 'sbom-path', value: '$(workspaces.workspace.path)/sbom' },
            ],
            workspaces: [{ name: 'workspace', workspace: 'workspace' }],
          },
        ],
      },
    });
  }
}
