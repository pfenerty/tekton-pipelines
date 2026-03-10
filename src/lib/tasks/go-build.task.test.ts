import { describe, it, expect } from 'vitest';
import { Testing, Chart } from 'cdk8s';
import { GoBuildTask, GoBuildPipelineTask } from './go-build.task';
import { GitClonePipelineTask } from './git-clone.task';

function synthGoBuildTask(): Record<string, unknown> {
  const app = Testing.app();
  const chart = new Chart(app, 'test');
  new GoBuildTask(chart, 'build-go', { namespace: 'test-ns' });
  const resources = Testing.synth(chart);
  const task = resources.find((r: Record<string, unknown>) => r['kind'] === 'Task');
  if (!task) throw new Error('Task not found in synth output');
  return task as Record<string, unknown>;
}

describe('GoBuildTask', () => {
  it('has the correct task name', () => {
    expect(GoBuildTask.defaultName).toBe('build-go');
  });

  it('does not set an unrelated workingDir', () => {
    const task = synthGoBuildTask();
    const spec = task['spec'] as Record<string, unknown>;
    const steps = spec['steps'] as Record<string, unknown>[];
    expect(steps[0]['workingDir']).toBeUndefined();
  });

  it('passes the build path via the -C flag arg', () => {
    const task = synthGoBuildTask();
    const spec = task['spec'] as Record<string, unknown>;
    const steps = spec['steps'] as Record<string, unknown>[];
    const args = steps[0]['args'] as string[];
    expect(args.some((a: string) => a.startsWith('-C='))).toBe(true);
  });
});

describe('GoBuildPipelineTask', () => {
  it('has the correct pipeline step name', () => {
    const task = new GoBuildPipelineTask();
    expect(task.name).toBe('build');
  });

  it('references the build-go Task', () => {
    const task = new GoBuildPipelineTask();
    const spec = task.toSpec() as Record<string, unknown>;
    expect(spec['taskRef']).toEqual({ kind: 'Task', name: 'build-go' });
  });

  it('omits runAfter when there are no dependencies', () => {
    const task = new GoBuildPipelineTask();
    const spec = task.toSpec() as Record<string, unknown>;
    expect(spec).not.toHaveProperty('runAfter');
  });

  it('includes runAfter when a dependency is provided', () => {
    const clone = new GitClonePipelineTask();
    const build = new GoBuildPipelineTask({ runAfter: clone });
    const spec = build.toSpec() as Record<string, unknown>;
    expect(spec['runAfter']).toEqual(['clone']);
  });

  it('binds the workspace', () => {
    const task = new GoBuildPipelineTask();
    const spec = task.toSpec() as Record<string, unknown>;
    expect(spec['workspaces']).toEqual([{ name: 'workspace', workspace: 'workspace' }]);
  });

  it('passes build-path, golang-version and golang-variant params', () => {
    const task = new GoBuildPipelineTask();
    const spec = task.toSpec() as Record<string, unknown>;
    const params = spec['params'] as Record<string, unknown>[];
    const paramNames = params.map(p => p['name']);
    expect(paramNames).toContain('build-path');
    expect(paramNames).toContain('golang-version');
    expect(paramNames).toContain('golang-variant');
  });
});
