import { describe, it, expect, vi, afterEach } from 'vitest';
import { GitPipeline } from './git-pipeline';
import { Pipeline } from './pipeline';
import { Task } from './task';
import { Workspace } from './workspace';
import { TektonicProject } from './tektonic-project';
import { TRIGGER_EVENTS } from './trigger-events';

const capturedCharts: any[] = [];

vi.mock('cdk8s', async () => {
  const actual = await vi.importActual<typeof import('cdk8s')>('cdk8s');
  return {
    ...actual,
    App: class MockApp extends actual.App {
      synth() { /* no-op — suppress file writes in tests */ }
    },
    Chart: class CaptureChart extends actual.Chart {
      constructor(scope: any, id: string, props?: any) {
        super(scope, id, props);
        capturedCharts.push(this);
      }
    },
  };
});

describe('TektonicProject', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    capturedCharts.length = 0;
  });

  const buildTask = new Task({
    name: 'build',
    steps: [{ name: 'build', image: 'golang:1.24' }],
  });

  const testTask = new Task({
    name: 'test',
    needs: [buildTask],
    steps: [{ name: 'test', image: 'golang:1.24' }],
  });

  it('constructs without error for a push pipeline', () => {
    const pipeline = new GitPipeline({
      name: 'my-push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [buildTask, testTask],
    });
    expect(() =>
      new TektonicProject({ namespace: 'ci', pipelines: [pipeline] }),
    ).not.toThrow();
  });

  it('constructs without error for push and PR pipelines', () => {
    const push = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [buildTask],
    });
    const pr = new GitPipeline({
      name: 'pull-request',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PULL_REQUEST }] },
      tasks: [buildTask, testTask],
    });
    expect(() =>
      new TektonicProject({ namespace: 'ci', pipelines: [push, pr] }),
    ).not.toThrow();
  });

  it('constructs with name prefix', () => {
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [buildTask],
    });
    expect(() =>
      new TektonicProject({ name: 'ocidex', namespace: 'ocidex-ci', pipelines: [pipeline] }),
    ).not.toThrow();
  });

  it('constructs with cache workspaces', () => {
    const goCache = new Workspace({ name: 'go-cache' });
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [buildTask],
    });
    expect(() =>
      new TektonicProject({
        name: 'ocidex',
        namespace: 'ocidex-ci',
        pipelines: [pipeline],
        caches: [{ workspace: goCache, storageSize: '5Gi', storageClassName: 'local-path' }],
      }),
    ).not.toThrow();
  });

  it('skips pipelines with no triggers', () => {
    const noTrigger = new Pipeline({ name: 'manual', tasks: [buildTask] });
    expect(() =>
      new TektonicProject({ namespace: 'ci', pipelines: [noTrigger] }),
    ).not.toThrow();
  });

  it('constructs with tag trigger', () => {
    const tag = new GitPipeline({
      name: 'release',
      trigger: { rules: [{ on: TRIGGER_EVENTS.TAG }] },
      tasks: [buildTask],
    });
    expect(() =>
      new TektonicProject({ namespace: 'ci', pipelines: [tag] }),
    ).not.toThrow();
  });

  it('constructs with a custom target branch', () => {
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH, branch: 'main' }] },
      tasks: [buildTask],
    });
    expect(() =>
      new TektonicProject({ namespace: 'ci', pipelines: [pipeline] }),
    ).not.toThrow();
  });

  it('constructs with custom pod security context', () => {
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [buildTask],
    });
    expect(() =>
      new TektonicProject({
        namespace: 'ci',
        pipelines: [pipeline],
        defaultPodSecurityContext: { runAsUser: 1024, runAsGroup: 1024, fsGroup: 1024 },
      }),
    ).not.toThrow();
  });

  it('constructs with repoRelativePath override', () => {
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [buildTask],
    });
    expect(() =>
      new TektonicProject({
        namespace: 'ci',
        pipelines: [pipeline],
        outdir: '../../.tekton',
        repoRelativePath: '.tekton',
      }),
    ).not.toThrow();
  });

  it('constructs with a glob target branch', () => {
    const pipeline = new GitPipeline({
      name: 'release',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH, branch: 'release/v*' }] },
      tasks: [buildTask],
    });
    expect(() =>
      new TektonicProject({ namespace: 'ci', pipelines: [pipeline] }),
    ).not.toThrow();
  });

  it('PipelineRun params bind source-branch to {{ source_branch }}', () => {
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [buildTask],
    });
    new TektonicProject({ namespace: 'ci', pipelines: [pipeline] });

    const allObjects = capturedCharts.flatMap((c: any) => c.toJson());
    const pipelineRun = allObjects.find((o: any) => o.kind === 'PipelineRun');
    const param = pipelineRun?.spec?.params?.find((p: any) => p.name === 'source-branch');
    expect(param?.value).toBe('{{ source_branch }}');
  });

  it('threads defaultImagePullPolicy into every synthesized task stepTemplate', () => {
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [buildTask, testTask],
    });
    new TektonicProject({
      namespace: 'ci',
      pipelines: [pipeline],
      defaultImagePullPolicy: 'Always',
    });

    const tasks = capturedCharts
      .flatMap((c: any) => c.toJson())
      .filter((o: any) => o.kind === 'Task');
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(t.spec.stepTemplate.imagePullPolicy).toBe('Always');
    }
  });

  it('merges pipelineRunAnnotations into the PipelineRun metadata alongside PAC annotations', () => {
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [buildTask],
    });
    new TektonicProject({
      namespace: 'ci',
      pipelines: [pipeline],
      pipelineRunAnnotations: { 'chains.tekton.dev/transparency-upload': 'true' },
    });

    const allObjects = capturedCharts.flatMap((c: any) => c.toJson());
    const pipelineRun = allObjects.find((o: any) => o.kind === 'PipelineRun');
    expect(pipelineRun.metadata.annotations['chains.tekton.dev/transparency-upload']).toBe('true');
    // PAC annotations are preserved.
    expect(pipelineRun.metadata.annotations['pipelinesascode.tekton.dev/on-event']).toBeDefined();
  });

  it('emits spec.timeouts.pipeline when the pipeline sets a timeout', () => {
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      timeout: '2h',
      tasks: [buildTask],
    });
    new TektonicProject({ namespace: 'ci', pipelines: [pipeline] });
    const pipelineRun = capturedCharts.flatMap((c: any) => c.toJson()).find((o: any) => o.kind === 'PipelineRun');
    expect(pipelineRun.spec.timeouts).toEqual({ pipeline: '2h' });
  });

  it('omits spec.timeouts when no timeout is set', () => {
    const pipeline = new GitPipeline({ name: 'push', trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] }, tasks: [buildTask] });
    new TektonicProject({ namespace: 'ci', pipelines: [pipeline] });
    const pipelineRun = capturedCharts.flatMap((c: any) => c.toJson()).find((o: any) => o.kind === 'PipelineRun');
    expect(pipelineRun.spec.timeouts).toBeUndefined();
  });

  describe('trigger annotations on the PipelineRun', () => {
    const PAC = 'pipelinesascode.tekton.dev';
    const annotationsFor = (trigger: any) => {
      const pipeline = new GitPipeline({ name: 'ci', trigger, tasks: [buildTask] });
      new TektonicProject({ namespace: 'ci', pipelines: [pipeline] });
      const pr = capturedCharts.flatMap((c: any) => c.toJson()).find((o: any) => o.kind === 'PipelineRun');
      return pr.metadata.annotations as Record<string, string>;
    };

    it('single rule → discrete on-event / on-target-branch / on-path-changed', () => {
      const a = annotationsFor({
        rules: [{ on: TRIGGER_EVENTS.PULL_REQUEST, branch: 'main', pathsChanged: ['src/**'] }],
        comment: '^/ci',
        cancelInProgress: true,
      });
      expect(a[`${PAC}/on-event`]).toBe('[pull_request]');
      expect(a[`${PAC}/on-target-branch`]).toBe('[main]');
      expect(a[`${PAC}/on-path-changed`]).toBe('[src/**]');
      expect(a[`${PAC}/on-comment`]).toBe('^/ci');
      expect(a[`${PAC}/cancel-in-progress`]).toBe('true');
    });

    it('compound rules → single on-cel-expression, no on-event', () => {
      const a = annotationsFor({
        rules: [
          { on: [TRIGGER_EVENTS.PUSH, TRIGGER_EVENTS.PULL_REQUEST], branch: 'main' },
          { on: TRIGGER_EVENTS.PULL_REQUEST, sourceBranch: 'feature/*', pathsChanged: ['src/**'] },
        ],
      });
      expect(a[`${PAC}/on-cel-expression`]).toContain(' || ');
      expect(a[`${PAC}/on-event`]).toBeUndefined();
      expect(a[`${PAC}/on-target-branch`]).toBeUndefined();
    });
  });

  describe('Repository CR', () => {
    const findRepo = () =>
      capturedCharts.flatMap((c: any) => c.toJson()).find((o: any) => o.kind === 'Repository');

    it('is not emitted when repository is omitted', () => {
      const pipeline = new GitPipeline({ name: 'push', trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] }, tasks: [buildTask] });
      new TektonicProject({ namespace: 'ci', pipelines: [pipeline] });
      expect(findRepo()).toBeUndefined();
    });

    it('emits a minimal Repository (GitHub-App style: url only)', () => {
      const pipeline = new GitPipeline({ name: 'push', trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] }, tasks: [buildTask] });
      new TektonicProject({
        name: 'app',
        namespace: 'ci',
        pipelines: [pipeline],
        repository: { url: 'https://github.com/pfenerty/app' },
      });
      const repo = findRepo();
      expect(repo.apiVersion).toBe('pipelinesascode.tekton.dev/v1alpha1');
      expect(repo.metadata.namespace).toBe('ci');
      expect(repo.spec.url).toBe('https://github.com/pfenerty/app');
      expect(repo.spec.git_provider).toBeUndefined();
    });

    it('emits a git_provider block with secret refs when configured', () => {
      const pipeline = new GitPipeline({ name: 'push', trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] }, tasks: [buildTask] });
      new TektonicProject({
        namespace: 'ci',
        pipelines: [pipeline],
        repository: {
          url: 'https://gitlab.com/acme/app',
          gitProvider: { type: 'gitlab', secretName: 'gl-token', webhookSecretName: 'gl-webhook' },
        },
      });
      const repo = findRepo();
      expect(repo.spec.git_provider.type).toBe('gitlab');
      expect(repo.spec.git_provider.secret).toEqual({ name: 'gl-token', key: 'token' });
      expect(repo.spec.git_provider.webhook_secret).toEqual({ name: 'gl-webhook', key: 'webhook.secret' });
    });
  });
});

describe('Pipeline.events', () => {
  const t = () => new Task({ name: 't', steps: [{ name: 's', image: 'alpine' }] });

  it('is empty when no trigger is set', () => {
    expect(new Pipeline({ name: 'p', tasks: [t()] }).events).toEqual([]);
  });

  it('is the union of the trigger rules events', () => {
    const p = new Pipeline({
      name: 'p',
      tasks: [t()],
      trigger: {
        rules: [
          { on: TRIGGER_EVENTS.PUSH, branch: 'main' },
          { on: TRIGGER_EVENTS.PULL_REQUEST, branch: 'main' },
        ],
      },
    });
    expect(p.events).toEqual([TRIGGER_EVENTS.PUSH, TRIGGER_EVENTS.PULL_REQUEST]);
  });
});

describe('same-named tasks across pipelines', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    capturedCharts.length = 0;
  });

  const gitPipeline = (name: string, event: TRIGGER_EVENTS, opts: Record<string, unknown> = {}) =>
    new GitPipeline({
      name,
      trigger: { rules: [{ on: event }] },
      tasks: [new Task({ name: `work-${name}`, steps: [{ name: 's', image: 'alpine' }] })],
      ...opts,
    });

  // Each GitPipeline generates its own git-clone Task, but only one is emitted and all
  // pipelines reference it by name — so identical declarations must keep deduping silently.
  it('dedupes identical auto-generated git-clone tasks', () => {
    expect(
      () =>
        new TektonicProject({
          namespace: 'ci',
          pipelines: [gitPipeline('push', TRIGGER_EVENTS.PUSH), gitPipeline('pr', TRIGGER_EVENTS.PULL_REQUEST)],
        }),
    ).not.toThrow();
  });

  it('rejects two git-clone tasks that differ in cloneDepth', () => {
    expect(
      () =>
        new TektonicProject({
          namespace: 'ci',
          pipelines: [
            gitPipeline('push', TRIGGER_EVENTS.PUSH, { cloneDepth: 'full' }),
            gitPipeline('pr', TRIGGER_EVENTS.PULL_REQUEST),
          ],
        }),
    ).toThrow(/task 'git-clone' is declared differently in pipelines 'push' and 'pr'/);
  });

  it('names the differing fields and the manifest they collapse into', () => {
    let message = '';
    try {
      new TektonicProject({
        name: 'demo',
        namespace: 'ci',
        pipelines: [
          gitPipeline('push', TRIGGER_EVENTS.PUSH, { cloneImage: 'alpine/git:latest' }),
          gitPipeline('pr', TRIGGER_EVENTS.PULL_REQUEST),
        ],
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("single Task 'demo-git-clone'");
    expect(message).toContain('spec.steps[0].image');
  });

  it('rejects two user tasks that share a name but differ', () => {
    const a = new Task({ name: 'lint', steps: [{ name: 's', image: 'golangci-lint:1' }] });
    const b = new Task({ name: 'lint', steps: [{ name: 's', image: 'golangci-lint:2' }] });
    expect(
      () =>
        new TektonicProject({
          namespace: 'ci',
          pipelines: [
            new Pipeline({ name: 'push', trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] }, tasks: [a] }),
            new Pipeline({ name: 'pr', trigger: { rules: [{ on: TRIGGER_EVENTS.PULL_REQUEST }] }, tasks: [b] }),
          ],
        }),
    ).toThrow(/task 'lint' is declared differently/);
  });
});

describe('pod template env', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    capturedCharts.length = 0;
  });

  const runOf = (opts: Record<string, unknown> = {}) => {
    const task = new Task({ name: 'work', steps: [{ name: 's', image: 'alpine' }] });
    const pipeline = new GitPipeline({
      name: 'push',
      trigger: { rules: [{ on: TRIGGER_EVENTS.PUSH }] },
      tasks: [task],
    });
    new TektonicProject({ namespace: 'ci', pipelines: [pipeline], ...opts });
    const run = capturedCharts
      .flatMap(c => c.toJson())
      .find((m: any) => m?.kind === 'PipelineRun');
    return run.spec.taskRunTemplate.podTemplate.env as { name: string; value?: string }[];
  };

  // A pod-level runAsUser with no /etc/passwd entry leaves $HOME as '/', which creds-init
  // cannot write to — git and registry credentials go with it.
  it('sets HOME to /tekton/home by default', () => {
    expect(runOf()).toContainEqual({ name: 'HOME', value: '/tekton/home' });
  });

  it('lets an explicit HOME win', () => {
    const env = runOf({ podTemplateEnv: [{ name: 'HOME', value: '/root' }] });
    expect(env.filter(e => e.name === 'HOME')).toEqual([{ name: 'HOME', value: '/root' }]);
  });

  it('injects the PAC event context on request', () => {
    const env = runOf({ pacEventContext: true });
    expect(env).toContainEqual({ name: 'PAC_EVENT_TYPE', value: '{{ event_type }}' });
    expect(env).toContainEqual({ name: 'PAC_TARGET_BRANCH', value: '{{ target_branch }}' });
    expect(env).toContainEqual({ name: 'PAC_REPO_NAME', value: '{{ repo_name }}' });
  });

  it('omits the PAC event context by default', () => {
    expect(runOf().some(e => e.name.startsWith('PAC_'))).toBe(false);
  });

  it('lets podTemplateEnv override an injected PAC variable', () => {
    const env = runOf({
      pacEventContext: true,
      podTemplateEnv: [{ name: 'PAC_EVENT_TYPE', value: 'override' }],
    });
    expect(env.filter(e => e.name === 'PAC_EVENT_TYPE')).toEqual([
      { name: 'PAC_EVENT_TYPE', value: 'override' },
    ]);
  });
});
