import { describe, it, expect, vi, afterEach } from 'vitest';
import { Pipeline } from './pipeline';
import { Task } from './task';
import { Param } from './param';
import { Workspace } from './workspace';
import { TektonProject } from './tekton-project';
import { TRIGGER_EVENTS } from './trigger-events';

// Mock cdk8s App.synth() to capture charts without writing files
vi.mock('cdk8s', async () => {
  const actual = await vi.importActual<typeof import('cdk8s')>('cdk8s');
  return {
    ...actual,
    App: class MockApp extends actual.App {
      synth() { /* no-op */ }
    },
  };
});

describe('TektonProject', () => {
  afterEach(() => vi.restoreAllMocks());

  const workspace = new Workspace({ name: 'workspace' });
  const url = new Param({ name: 'url' });
  const rev = new Param({ name: 'revision' });
  const path = new Param({ name: 'build-path', default: './' });

  const clone = new Task({
    name: 'git-clone',
    params: [url, rev],
    workspaces: [workspace],
    steps: [{ name: 'clone', image: 'git' }],
  });

  const test = new Task({
    name: 'test',
    params: [path],
    workspaces: [workspace],
    needs: [clone],
    steps: [{ name: 'test', image: 'node' }],
  });

  const build = new Task({
    name: 'build',
    params: [path],
    workspaces: [workspace],
    needs: [clone],
    steps: [{ name: 'build', image: 'node' }],
  });

  it('constructs without error', () => {
    expect(() => {
      new TektonProject({
        namespace: 'ns',
        pipelines: [new Pipeline({ name: 'ci', tasks: [test] })],
      });
    }).not.toThrow();
  });

  it('constructs with triggers without error', () => {
    expect(() => {
      new TektonProject({
        name: 'myapp',
        namespace: 'ns',
        pipelines: [
          new Pipeline({ name: 'push', triggers: [TRIGGER_EVENTS.PUSH], tasks: [test] }),
          new Pipeline({ name: 'pr', triggers: [TRIGGER_EVENTS.PULL_REQUEST], tasks: [test, build] }),
        ],
        webhookSecretRef: { secretName: 'secret', secretKey: 'key' },
      });
    }).not.toThrow();
  });

  it('constructs with name prefix', () => {
    expect(() => {
      new TektonProject({
        name: 'prefixed',
        namespace: 'ns',
        pipelines: [new Pipeline({ name: 'ci', tasks: [test] })],
      });
    }).not.toThrow();
  });

  it('constructs without triggers (no infra chart)', () => {
    expect(() => {
      new TektonProject({
        namespace: 'ns',
        pipelines: [new Pipeline({ name: 'ci', tasks: [test, build] })],
      });
    }).not.toThrow();
  });

  it('includes finally tasks in synthesized resources', () => {
    const finalTask = new Task({
      name: 'final-report',
      steps: [{ name: 'report', image: 'alpine' }],
    });
    // Should not throw — finally task is included in unique task collection
    expect(() => {
      new TektonProject({
        namespace: 'ns',
        pipelines: [
          new Pipeline({ name: 'ci', tasks: [test], finallyTasks: [finalTask] }),
        ],
      });
    }).not.toThrow();
  });

  it('constructs with GCS caches without error', () => {
    const cacheWs = new Workspace({ name: 'npm-cache' });
    expect(() => {
      new TektonProject({
        name: 'myapp',
        namespace: 'ns',
        pipelines: [
          new Pipeline({ name: 'push', triggers: [TRIGGER_EVENTS.PUSH], tasks: [test] }),
        ],
        caches: [
          { workspace: cacheWs, backend: { type: 'gcs', bucket: 'my-bucket' } },
        ],
      });
    }).not.toThrow();
  });

  it('constructs with mixed PVC and GCS caches', () => {
    const pvcWs = new Workspace({ name: 'pvc-cache' });
    const gcsWs = new Workspace({ name: 'gcs-cache' });
    expect(() => {
      new TektonProject({
        name: 'myapp',
        namespace: 'ns',
        pipelines: [
          new Pipeline({ name: 'push', triggers: [TRIGGER_EVENTS.PUSH], tasks: [test] }),
        ],
        caches: [
          { workspace: pvcWs, storageSize: '2Gi' },
          { workspace: gcsWs, backend: { type: 'gcs', bucket: 'my-bucket' } },
        ],
      });
    }).not.toThrow();
  });

  it('deduplicates tasks shared across pipelines', () => {
    // Both pipelines share clone and test — should not throw duplicate errors
    expect(() => {
      new TektonProject({
        namespace: 'ns',
        pipelines: [
          new Pipeline({ name: 'p1', tasks: [test] }),
          new Pipeline({ name: 'p2', tasks: [test, build] }),
        ],
      });
    }).not.toThrow();
  });
});
