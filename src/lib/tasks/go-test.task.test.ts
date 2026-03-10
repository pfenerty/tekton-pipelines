import { describe, it, expect } from 'vitest';
import { Testing, Chart } from 'cdk8s';
import { GoTestTask } from './go-test.task';

function synthGoTestTask(): Record<string, unknown> {
  const app = Testing.app();
  const chart = new Chart(app, 'test');
  new GoTestTask(chart, 'test-go', { namespace: 'test-ns' });
  const resources = Testing.synth(chart);
  const task = resources.find((r: Record<string, unknown>) => r['kind'] === 'Task');
  if (!task) throw new Error('Task not found in synth output');
  return task as Record<string, unknown>;
}

describe('GoTestTask', () => {
  it('has the correct task name', () => {
    expect(GoTestTask.defaultName).toBe('test-go');
  });

  it('uses go test ./... to recursively test all packages', () => {
    const task = synthGoTestTask();
    const spec = task['spec'] as Record<string, unknown>;
    const steps = spec['steps'] as Record<string, unknown>[];
    expect(steps).toHaveLength(1);
    expect(steps[0]['command']).toEqual(['go', 'test', './...']);
  });

  it('sets workingDir to the workspace path / build-path param', () => {
    const task = synthGoTestTask();
    const spec = task['spec'] as Record<string, unknown>;
    const steps = spec['steps'] as Record<string, unknown>[];
    expect(steps[0]['workingDir']).toContain('$(workspaces.');
    expect(steps[0]['workingDir']).toContain('$(params.build-path)');
  });

  it('declares the workspace binding', () => {
    const task = synthGoTestTask();
    const spec = task['spec'] as Record<string, unknown>;
    const workspaces = spec['workspaces'] as Record<string, unknown>[];
    expect(workspaces).toEqual([{ name: 'workspace' }]);
  });
});
