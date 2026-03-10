import { describe, it, expect } from 'vitest';
import { Testing, Chart } from 'cdk8s';
import { GoPushPipeline } from './go-push.pipeline';

function synthGoPush(props: { namespace: string; name?: string }): Record<string, unknown> {
  const app = Testing.app();
  const chart = new Chart(app, 'test');
  new GoPushPipeline(chart, 'pipeline', props);
  const resources = Testing.synth(chart);
  const pipeline = resources.find((r: Record<string, unknown>) => r['kind'] === 'Pipeline');
  if (!pipeline) throw new Error('Pipeline not found in synth output');
  return pipeline as Record<string, unknown>;
}

describe('GoPushPipeline', () => {
  it('defaults name to go-push', () => {
    const pipeline = synthGoPush({ namespace: 'test-ns' });
    expect((pipeline['metadata'] as Record<string, unknown>)['name']).toBe('go-push');
  });

  it('uses custom name when provided', () => {
    const pipeline = synthGoPush({ namespace: 'test-ns', name: 'my-push' });
    expect((pipeline['metadata'] as Record<string, unknown>)['name']).toBe('my-push');
  });

  it('sets namespace on the pipeline', () => {
    const pipeline = synthGoPush({ namespace: 'ci-builds' });
    expect((pipeline['metadata'] as Record<string, unknown>)['namespace']).toBe('ci-builds');
  });

  it('has exactly 2 tasks: clone then test', () => {
    const pipeline = synthGoPush({ namespace: 'test-ns' });
    const tasks = (pipeline['spec'] as Record<string, unknown>)['tasks'] as Record<string, unknown>[];
    expect(tasks).toHaveLength(2);
    expect(tasks[0]['name']).toBe('clone');
    expect(tasks[1]['name']).toBe('test');
  });

  it('test task runs after clone', () => {
    const pipeline = synthGoPush({ namespace: 'test-ns' });
    const tasks = (pipeline['spec'] as Record<string, unknown>)['tasks'] as Record<string, unknown>[];
    expect(tasks[1]['runAfter']).toEqual(['clone']);
  });

  it('clone task has no runAfter', () => {
    const pipeline = synthGoPush({ namespace: 'test-ns' });
    const tasks = (pipeline['spec'] as Record<string, unknown>)['tasks'] as Record<string, unknown>[];
    expect(tasks[0]).not.toHaveProperty('runAfter');
  });

  it('exposes all expected pipeline params', () => {
    const pipeline = synthGoPush({ namespace: 'test-ns' });
    const params = (pipeline['spec'] as Record<string, unknown>)['params'] as Record<string, unknown>[];
    const paramNames = params.map(p => p['name']);
    expect(paramNames).toContain('git-url');
    expect(paramNames).toContain('git-revision');
    expect(paramNames).toContain('project-name');
    expect(paramNames).toContain('app-root');
    expect(paramNames).toContain('build-path');
    expect(paramNames).toContain('golang-version');
    expect(paramNames).toContain('golang-variant');
  });

  it('declares the workspace', () => {
    const pipeline = synthGoPush({ namespace: 'test-ns' });
    const workspaces = (pipeline['spec'] as Record<string, unknown>)['workspaces'] as Record<string, unknown>[];
    expect(workspaces).toEqual([{ name: 'workspace' }]);
  });

  it('exposes pipelineName property', () => {
    const app = Testing.app();
    const chart = new Chart(app, 'test');
    const pipeline = new GoPushPipeline(chart, 'p', { namespace: 'ns' });
    expect(pipeline.pipelineName).toBe('go-push');
  });
});
