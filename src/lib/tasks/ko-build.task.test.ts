import { describe, it, expect } from 'vitest';
import { KoBuildPipelineTask } from './ko-build.task';
import { GitClonePipelineTask } from './git-clone.task';

describe('KoBuildPipelineTask', () => {
  it('has the correct pipeline step name', () => {
    const task = new KoBuildPipelineTask();
    expect(task.name).toBe('build');
  });

  it('defaults pathToAppRoot to "app"', () => {
    const task = new KoBuildPipelineTask();
    const spec = task.toSpec() as Record<string, unknown>;
    const params = spec['params'] as Record<string, unknown>[];
    const pathParam = params.find(p => p['name'] === 'path-to-app-root');
    expect(pathParam?.['value']).toBe('app');
  });

  it('uses a custom pathToAppRoot when provided', () => {
    const task = new KoBuildPipelineTask({ pathToAppRoot: 'cmd/server' });
    const spec = task.toSpec() as Record<string, unknown>;
    const params = spec['params'] as Record<string, unknown>[];
    const pathParam = params.find(p => p['name'] === 'path-to-app-root');
    expect(pathParam?.['value']).toBe('cmd/server');
  });

  it('omits runAfter when there are no dependencies', () => {
    const task = new KoBuildPipelineTask();
    const spec = task.toSpec() as Record<string, unknown>;
    expect(spec).not.toHaveProperty('runAfter');
  });

  it('includes runAfter when a dependency is provided', () => {
    const clone = new GitClonePipelineTask();
    const build = new KoBuildPipelineTask({ runAfter: clone });
    const spec = build.toSpec() as Record<string, unknown>;
    expect(spec['runAfter']).toEqual(['clone']);
  });

  it('references the ko-build Task', () => {
    const task = new KoBuildPipelineTask();
    const spec = task.toSpec() as Record<string, unknown>;
    expect(spec['taskRef']).toEqual({ kind: 'Task', name: 'ko-build' });
  });
});
