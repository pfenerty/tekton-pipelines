import { describe, it, expect } from 'vitest';
import { Testing, Chart } from 'cdk8s';
import { PipelineBuilder } from './pipeline-builder';
import { GitClonePipelineTask } from '../tasks/git-clone.task';
import { GoTestPipelineTask } from '../tasks/go-test.task';
import { GenerateSbomPipelineTask } from '../tasks/generate-sbom.task';
import { VulnScanPipelineTask } from '../tasks/vuln-scan.task';

function synthPipeline(configure: (builder: PipelineBuilder) => void): Record<string, unknown> {
  const app = Testing.app();
  const chart = new Chart(app, 'test');
  const builder = new PipelineBuilder();
  configure(builder);
  builder.build(chart, 'pipeline', { name: 'test-pipeline', namespace: 'test-ns' });
  const resources = Testing.synth(chart);
  const pipeline = resources.find((r: Record<string, unknown>) => r['kind'] === 'Pipeline');
  if (!pipeline) throw new Error('Pipeline not found in synth output');
  return pipeline as Record<string, unknown>;
}

describe('PipelineBuilder', () => {
  describe('addFirst()', () => {
    it('registers a task with no dependencies', () => {
      const pipeline = synthPipeline(b =>
        b.addFirst('clone', () => new GitClonePipelineTask()),
      );
      const tasks = (pipeline['spec'] as Record<string, unknown>)['tasks'] as Record<string, unknown>[];
      expect(tasks).toHaveLength(1);
      expect(tasks[0]['name']).toBe('clone');
      expect(tasks[0]).not.toHaveProperty('runAfter');
    });
  });

  describe('addTask() with explicit dependencies', () => {
    it('sets runAfter on the dependent task', () => {
      const pipeline = synthPipeline(b =>
        b
          .addFirst('clone', () => new GitClonePipelineTask())
          .addTask('test', ([clone]) => new GoTestPipelineTask({ runAfter: clone }), ['clone']),
      );
      const tasks = (pipeline['spec'] as Record<string, unknown>)['tasks'] as Record<string, unknown>[];
      expect(tasks).toHaveLength(2);
      expect(tasks[1]['name']).toBe('test');
      expect(tasks[1]['runAfter']).toEqual(['clone']);
    });

    it('places tasks with the same dependency in parallel (both reference clone)', () => {
      const pipeline = synthPipeline(b =>
        b
          .addFirst('clone', () => new GitClonePipelineTask())
          .addTask('test', ([clone]) => new GoTestPipelineTask({ runAfter: clone }), ['clone'])
          .addTask('sbom', ([clone]) => new GenerateSbomPipelineTask({ runAfter: clone }), ['clone']),
      );
      const tasks = (pipeline['spec'] as Record<string, unknown>)['tasks'] as Record<string, unknown>[];
      expect(tasks).toHaveLength(3);
      const testTask = tasks.find(t => t['name'] === 'test')!;
      const sbomTask = tasks.find(t => t['name'] === 'generate-sbom')!;
      expect(testTask['runAfter']).toEqual(['clone']);
      expect(sbomTask['runAfter']).toEqual(['clone']);
    });

    it('preserves topological order (dep before dependent)', () => {
      const pipeline = synthPipeline(b =>
        b
          .addFirst('clone', () => new GitClonePipelineTask())
          .addTask('sbom', ([clone]) => new GenerateSbomPipelineTask({ runAfter: clone }), ['clone'])
          .addTask('vuln', ([sbom]) => new VulnScanPipelineTask({ runAfter: sbom }), ['sbom']),
      );
      const tasks = (pipeline['spec'] as Record<string, unknown>)['tasks'] as Record<string, unknown>[];
      const names = tasks.map(t => t['name']);
      expect(names.indexOf('clone')).toBeLessThan(names.indexOf('generate-sbom'));
      expect(names.indexOf('generate-sbom')).toBeLessThan(names.indexOf('vulnerability-scan'));
    });
  });

  describe('addAfterAll()', () => {
    it('makes the task depend on all previously registered tasks', () => {
      const pipeline = synthPipeline(b =>
        b
          .addFirst('clone', () => new GitClonePipelineTask())
          .addFirst('setup', () => new GitClonePipelineTask({ name: 'setup' }))
          .addAfterAll('test', ([clone, setup]) =>
            new GoTestPipelineTask({ runAfter: [clone, setup] }),
          ),
      );
      const tasks = (pipeline['spec'] as Record<string, unknown>)['tasks'] as Record<string, unknown>[];
      const testTask = tasks.find(t => t['name'] === 'test')!;
      expect(testTask['runAfter']).toContain('clone');
      expect(testTask['runAfter']).toContain('setup');
    });
  });

  describe('build() metadata and options', () => {
    it('sets pipeline name from opts', () => {
      const app = Testing.app();
      const chart = new Chart(app, 'test');
      new PipelineBuilder()
        .addFirst('clone', () => new GitClonePipelineTask())
        .build(chart, 'p', { name: 'my-go-pipeline', namespace: 'ci' });
      const [resource] = Testing.synth(chart);
      expect((resource as Record<string, unknown>)['metadata']).toMatchObject({
        name: 'my-go-pipeline',
        namespace: 'ci',
      });
    });

    it('includes params in spec', () => {
      const app = Testing.app();
      const chart = new Chart(app, 'test');
      new PipelineBuilder()
        .addFirst('clone', () => new GitClonePipelineTask())
        .build(chart, 'p', {
          name: 'p',
          namespace: 'ns',
          params: [{ name: 'git-url', type: 'string' }],
        });
      const [resource] = Testing.synth(chart) as Record<string, unknown>[];
      const spec = resource['spec'] as Record<string, unknown>;
      expect(spec['params']).toEqual([{ name: 'git-url', type: 'string' }]);
    });

    it('includes workspaces in spec', () => {
      const app = Testing.app();
      const chart = new Chart(app, 'test');
      new PipelineBuilder()
        .addFirst('clone', () => new GitClonePipelineTask())
        .build(chart, 'p', {
          name: 'p',
          namespace: 'ns',
          workspaces: [{ name: 'workspace' }],
        });
      const [resource] = Testing.synth(chart) as Record<string, unknown>[];
      const spec = resource['spec'] as Record<string, unknown>;
      expect(spec['workspaces']).toEqual([{ name: 'workspace' }]);
    });
  });

  describe('error handling', () => {
    it('throws on duplicate task key', () => {
      const builder = new PipelineBuilder();
      builder.addFirst('clone', () => new GitClonePipelineTask());
      expect(() => builder.addFirst('clone', () => new GitClonePipelineTask())).toThrow(
        "duplicate task key 'clone'",
      );
    });

    it('throws on cycle', () => {
      const app = Testing.app();
      const chart = new Chart(app, 'test');
      const builder = new PipelineBuilder()
        .addTask('a', ([b]) => new GitClonePipelineTask({ name: 'a', runAfter: b }), ['b'])
        .addTask('b', ([a]) => new GitClonePipelineTask({ name: 'b', runAfter: a }), ['a']);
      expect(() => builder.build(chart, 'p', { name: 'p', namespace: 'ns' })).toThrow(
        /cycle/i,
      );
    });

    it('throws on unknown dependency key', () => {
      const app = Testing.app();
      const chart = new Chart(app, 'test');
      const builder = new PipelineBuilder().addTask(
        'test',
        ([clone]) => new GoTestPipelineTask({ runAfter: clone }),
        ['nonexistent'],
      );
      expect(() => builder.build(chart, 'p', { name: 'p', namespace: 'ns' })).toThrow(
        /unknown task key/i,
      );
    });
  });
});
