import { describe, it, expect } from 'vitest';
import { App, Chart } from 'cdk8s';
import { Task } from './task';
import { Param } from './param';
import { Workspace } from './workspace';
import { RESTRICTED_STEP_SECURITY_CONTEXT, DEFAULT_STEP_RESOURCES } from '../constants';
import { GitHubStatusReporter } from '../reporters/github-status-reporter';

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

  it('auto-merges statusReporter.requiredParams into params', () => {
    const reporter = new GitHubStatusReporter();
    const buildPath = new Param({ name: 'build-path', default: './' });
    const t = new Task({
      name: 'test',
      params: [buildPath],
      statusReporter: reporter,
      steps: [{ name: 's', image: 'alpine' }],
    });
    const paramNames = t.params.map(p => p.name);
    expect(paramNames).toContain('build-path');
    expect(paramNames).toContain('revision');
    expect(paramNames).toContain('repo-full-name');
  });

  it('user-declared params take precedence over statusReporter params on name collision', () => {
    const customRevision = new Param({ name: 'revision', type: 'string', description: 'custom' });
    const reporter = new GitHubStatusReporter();
    const t = new Task({
      name: 'test',
      params: [customRevision],
      statusReporter: reporter,
      steps: [{ name: 's', image: 'alpine' }],
    });
    const revParam = t.params.find(p => p.name === 'revision');
    expect(revParam?.description).toBe('custom');
    expect(t.params.filter(p => p.name === 'revision')).toHaveLength(1);
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

    it('applies default resource requests and limits via stepTemplate', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({ name: 'bare', steps: [{ name: 's', image: 'alpine' }] });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.stepTemplate.computeResources).toEqual(DEFAULT_STEP_RESOURCES);
      expect(manifest.spec.steps[0].computeResources).toBeUndefined();
    });

    it('per-step computeResources override default', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'heavy',
        steps: [{ name: 's', image: 'alpine', computeResources: { limits: { cpu: '4', memory: '4Gi' } } }],
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.steps[0].computeResources).toEqual({ limits: { cpu: '4', memory: '4Gi' } });
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

    it('merges project defaultStepSecurityContext into stepTemplate securityContext', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({ name: 'bare', steps: [{ name: 's', image: 'alpine' }] });
      t.synth(chart, 'ns', undefined, { runAsNonRoot: true, runAsUser: 1000 });
      const manifest = chart.toJson()[0];
      expect(manifest.spec.stepTemplate.securityContext.allowPrivilegeEscalation).toBe(false);
      expect(manifest.spec.stepTemplate.securityContext.runAsNonRoot).toBe(true);
      expect(manifest.spec.stepTemplate.securityContext.runAsUser).toBe(1000);
    });

    it('task stepTemplate.securityContext overrides project defaultStepSecurityContext', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'custom',
        steps: [{ name: 's', image: 'alpine' }],
        stepTemplate: { securityContext: { allowPrivilegeEscalation: false, runAsUser: 999 } },
      });
      t.synth(chart, 'ns', undefined, { runAsUser: 1000 });
      const manifest = chart.toJson()[0];
      // task stepTemplate wins over project default
      expect(manifest.spec.stepTemplate.securityContext.runAsUser).toBe(999);
    });

    it('per-step securityContext appears in synthesized step spec', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'step-ctx',
        steps: [
          { name: 'privileged', image: 'alpine', securityContext: { runAsUser: 0 } },
          { name: 'normal', image: 'alpine' },
        ],
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.steps[0].securityContext).toEqual({ runAsUser: 0 });
      expect(manifest.spec.steps[1].securityContext).toBeUndefined();
    });

    it('stepTemplate.securityContext does not include pod-level fields by default', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({ name: 'bare', steps: [{ name: 's', image: 'alpine' }] });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.stepTemplate.securityContext.fsGroup).toBeUndefined();
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

  describe('cache step injection', () => {
    const cacheWs = new Workspace({ name: 'npm-cache' });
    const cacheSpec = {
      key: ['package-lock.json'],
      paths: ['node_modules'],
      workspace: cacheWs,
    };

    it('auto-adds cache workspace to task workspaces', () => {
      const t = new Task({ name: 'cached', steps: [{ name: 's', image: 'alpine' }], caches: [cacheSpec] });
      expect(t.workspaces.map(w => w.name)).toContain('npm-cache');
    });

    it('does not duplicate workspace already declared', () => {
      const t = new Task({
        name: 'cached',
        workspaces: [cacheWs],
        steps: [{ name: 's', image: 'alpine' }],
        caches: [cacheSpec],
      });
      expect(t.workspaces.filter(w => w.name === 'npm-cache')).toHaveLength(1);
    });

    it('inserts restore step before and save step after user steps', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'cached',
        steps: [{ name: 'run', image: 'alpine' }],
        caches: [cacheSpec],
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      const names = manifest.spec.steps.map((s: any) => s.name);
      expect(names[0]).toBe('cache-restore-npm-cache');
      expect(names[1]).toBe('run');
      expect(names[2]).toBe('cache-save-npm-cache');
    });

    it('save step is inserted before status reporter step', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const reporter = new GitHubStatusReporter();
      const t = new Task({
        name: 'cached',
        statusReporter: reporter,
        steps: [{ name: 'run', image: 'alpine' }],
        caches: [cacheSpec],
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      const names = manifest.spec.steps.map((s: any) => s.name);
      const saveIdx = names.indexOf('cache-save-npm-cache');
      const reporterIdx = names.findIndex((n: string) => n !== 'cache-restore-npm-cache' && n !== 'run' && n !== 'cache-save-npm-cache');
      expect(saveIdx).toBeGreaterThan(0);
      expect(reporterIdx).toBeGreaterThan(saveIdx);
    });

    it('restore script hashes key files and uses workspace path', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'cached',
        steps: [{ name: 'run', image: 'alpine' }],
        caches: [cacheSpec],
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      const restoreStep = manifest.spec.steps.find((s: any) => s.name === 'cache-restore-npm-cache');
      expect(restoreStep.script).toContain('sha256sum');
      expect(restoreStep.script).toContain('$(workspaces.npm-cache.path)');
      expect(restoreStep.script).toContain('package-lock.json');
      expect(restoreStep.script).toContain('node_modules');
    });

    it('save script reads hash file and skips when cache dir exists', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'cached',
        steps: [{ name: 'run', image: 'alpine' }],
        caches: [cacheSpec],
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      const saveStep = manifest.spec.steps.find((s: any) => s.name === 'cache-save-npm-cache');
      expect(saveStep.script).toContain('/tekton/home/.cache-npm-cache-hash');
      expect(saveStep.script).toContain('[ ! -d "$CACHE_DIR" ]');
      expect(saveStep.onError).toBe('continue');
    });

    it('multiple caches produce multiple restore/save pairs in order', () => {
      const ws2 = new Workspace({ name: 'go-cache' });
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({
        name: 'multi',
        steps: [{ name: 'run', image: 'alpine' }],
        caches: [
          cacheSpec,
          { key: ['go.sum'], paths: ['vendor'], workspace: ws2 },
        ],
      });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      const names = manifest.spec.steps.map((s: any) => s.name);
      expect(names).toEqual([
        'cache-restore-npm-cache',
        'cache-restore-go-cache',
        'run',
        'cache-save-npm-cache',
        'cache-save-go-cache',
      ]);
    });

    describe('compress: true', () => {
      const compressedSpec = { ...cacheSpec, compress: true as const };

      it('restore script uses tar -I zstd and .tar.zst archive', () => {
        const app = new App();
        const chart = new Chart(app, 'test');
        const t = new Task({ name: 'c', steps: [{ name: 's', image: 'alpine' }], caches: [compressedSpec] });
        t.synth(chart, 'ns');
        const step = chart.toJson()[0].spec.steps.find((s: any) => s.name === 'cache-restore-npm-cache');
        expect(step.script).toContain('tar -xzf "$ARCHIVE"');
        expect(step.script).toContain('.tar.gz');
        expect(step.script).toContain('[ -f "$ARCHIVE" ]');
      });

      it('save script uses tar -I zstd and .tar.zst archive', () => {
        const app = new App();
        const chart = new Chart(app, 'test');
        const t = new Task({ name: 'c', steps: [{ name: 's', image: 'alpine' }], caches: [compressedSpec] });
        t.synth(chart, 'ns');
        const step = chart.toJson()[0].spec.steps.find((s: any) => s.name === 'cache-save-npm-cache');
        expect(step.script).toContain('tar -czf "$ARCHIVE"');
        expect(step.script).toContain('.tar.gz');
        expect(step.script).toContain('[ ! -f "$ARCHIVE" ]');
      });

      it('scripts do not require any package installation', () => {
        const app = new App();
        const chart = new Chart(app, 'test');
        const t = new Task({ name: 'c', steps: [{ name: 's', image: 'alpine' }], caches: [compressedSpec] });
        t.synth(chart, 'ns');
        const steps = chart.toJson()[0].spec.steps;
        const restore = steps.find((s: any) => s.name === 'cache-restore-npm-cache');
        const save = steps.find((s: any) => s.name === 'cache-save-npm-cache');
        expect(restore.script).not.toContain('apk add');
        expect(save.script).not.toContain('apk add');
      });

      it('workingDir is set on restore and save steps when provided', () => {
        const app = new App();
        const chart = new Chart(app, 'test');
        const t = new Task({
          name: 'c',
          steps: [{ name: 's', image: 'alpine' }],
          caches: [{ ...compressedSpec, workingDir: '$(workspaces.workspace.path)' }],
        });
        t.synth(chart, 'ns');
        const steps = chart.toJson()[0].spec.steps;
        const restore = steps.find((s: any) => s.name === 'cache-restore-npm-cache');
        const save = steps.find((s: any) => s.name === 'cache-save-npm-cache');
        expect(restore.workingDir).toBe('$(workspaces.workspace.path)');
        expect(save.workingDir).toBe('$(workspaces.workspace.path)');
      });

      it('workingDir is omitted from steps when not provided', () => {
        const app = new App();
        const chart = new Chart(app, 'test');
        const t = new Task({ name: 'c', steps: [{ name: 's', image: 'alpine' }], caches: [compressedSpec] });
        t.synth(chart, 'ns');
        const steps = chart.toJson()[0].spec.steps;
        const restore = steps.find((s: any) => s.name === 'cache-restore-npm-cache');
        expect(restore.workingDir).toBeUndefined();
      });

      it('uncompressed cache still uses cp -r, not tar', () => {
        const app = new App();
        const chart = new Chart(app, 'test');
        const t = new Task({ name: 'c', steps: [{ name: 's', image: 'alpine' }], caches: [cacheSpec] });
        t.synth(chart, 'ns');
        const steps = chart.toJson()[0].spec.steps;
        const restore = steps.find((s: any) => s.name === 'cache-restore-npm-cache');
        const save = steps.find((s: any) => s.name === 'cache-save-npm-cache');
        expect(restore.script).toContain('cp -r');
        expect(restore.script).not.toContain('tar');
        expect(save.script).toContain('cp -r');
        expect(save.script).not.toContain('tar');
      });
    });

    it('task with no caches is unchanged', () => {
      const app = new App();
      const chart = new Chart(app, 'test');
      const t = new Task({ name: 'plain', steps: [{ name: 's', image: 'alpine' }] });
      t.synth(chart, 'ns');
      const manifest = chart.toJson()[0];
      expect(manifest.spec.steps).toHaveLength(1);
      expect(manifest.spec.steps[0].name).toBe('s');
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
