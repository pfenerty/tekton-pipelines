import { describe, it, expect } from 'vitest';
import { App, Chart } from 'cdk8s';
import { Task } from './task';
import { Param } from './param';
import { Workspace } from './workspace';
import { RESTRICTED_STEP_SECURITY_CONTEXT, DEFAULT_STEP_RESOURCES } from '../constants';

describe('Task', () => {
  const workspace = new Workspace({ name: 'workspace' });
  const urlParam = new Param({ name: 'url' });

  it('stores all properties', () => {
    const dep = new Task({ name: 'dep', steps: [{ name: 's', image: 'alpine' }] });
    const t = new Task({
      name: 'test',
      params: [urlParam],
      workspaces: [workspace],
      needs: [dep],
      steps: [{ name: 'run', image: 'node:22' }],
    });
    expect(t.name).toBe('test');
    expect(t.params).toEqual([urlParam]);
    expect(t.workspaces).toEqual([workspace]);
    expect(t.needs).toEqual([dep]);
    expect(t.steps).toHaveLength(1);
  });

  it('defaults needs to empty array', () => {
    const t = new Task({ name: 'solo', steps: [{ name: 's', image: 'alpine' }] });
    expect(t.needs).toEqual([]);
    expect(t.params).toEqual([]);
    expect(t.workspaces).toEqual([]);
  });

  describe('synth()', () => {
    it('creates valid Task resource with default security context', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'my-task',
        params: [urlParam],
        workspaces: [workspace],
        steps: [{ name: 'run', image: 'alpine', command: ['echo', 'hi'] }],
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.apiVersion).toBe('tekton.dev/v1');
      expect(manifest.kind).toBe('Task');
      expect(manifest.metadata).toEqual({ name: 'my-task', namespace: 'ns' });
      expect(manifest.spec.params).toEqual([{ name: 'url', type: 'string' }]);
      expect(manifest.spec.workspaces).toEqual([{ name: 'workspace' }]);
      expect(manifest.spec.stepTemplate.securityContext.allowPrivilegeEscalation).toBe(false);
    });

    it('applies default resource requests and limits', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({ name: 'bare', steps: [{ name: 's', image: 'alpine' }] });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.stepTemplate.resources).toEqual(DEFAULT_STEP_RESOURCES);
    });

    it('custom stepTemplate resources replace default', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'heavy',
        steps: [{ name: 's', image: 'alpine' }],
        stepTemplate: { resources: { limits: { cpu: '4', memory: '4Gi' } } },
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.stepTemplate.resources).toEqual({ limits: { cpu: '4', memory: '4Gi' } });
    });

    it('passes per-step resources through to step spec', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'per-step',
        steps: [{ name: 'build', image: 'golang', resources: { limits: { memory: '2Gi' } } }],
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.steps[0].resources).toEqual({ limits: { memory: '2Gi' } });
    });

    it('merges custom stepTemplate over defaults', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'restricted',
        steps: [{ name: 'run', image: 'alpine' }],
        stepTemplate: { securityContext: RESTRICTED_STEP_SECURITY_CONTEXT },
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.stepTemplate.securityContext.runAsNonRoot).toBe(true);
    });

    it('applies namePrefix', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({ name: 'clone', steps: [{ name: 's', image: 'git' }] });
      t.synth(chart, 'ns', 'myapp');
      const manifest = chart.toJson()[0];
      expect(manifest.metadata.name).toBe('myapp-clone');
    });

    it('omits params and workspaces when empty', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({ name: 'bare', steps: [{ name: 's', image: 'alpine' }] });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.params).toBeUndefined();
      expect(manifest.spec.workspaces).toBeUndefined();
    });
  });

  describe('_toPipelineTaskSpec()', () => {
    it('generates correct spec with taskRef, params, workspaces, runAfter', () => {
      const t = new Task({
        name: 'test',
        params: [urlParam],
        workspaces: [workspace],
        steps: [{ name: 'run', image: 'alpine' }],
      });
      const spec = t._toPipelineTaskSpec(['clone']);
      expect(spec).toEqual({
        name: 'test',
        taskRef: { kind: 'Task', name: 'test' },
        params: [{ name: 'url', value: '$(params.url)' }],
        workspaces: [{ name: 'workspace', workspace: 'workspace' }],
        runAfter: ['clone'],
      });
    });

    it('applies namePrefix to taskRef', () => {
      const t = new Task({ name: 'build', steps: [{ name: 's', image: 'alpine' }] });
      const spec = t._toPipelineTaskSpec([], 'myapp');
      expect(spec.taskRef).toEqual({ kind: 'Task', name: 'myapp-build' });
    });

    it('omits runAfter when empty', () => {
      const t = new Task({ name: 'first', steps: [{ name: 's', image: 'alpine' }] });
      const spec = t._toPipelineTaskSpec([]);
      expect(spec.runAfter).toBeUndefined();
    });
  });
});
