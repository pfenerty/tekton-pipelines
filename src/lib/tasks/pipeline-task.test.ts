import { describe, it, expect } from 'vitest';
import { GitClonePipelineTask } from './git-clone.task';
import { GoTestPipelineTask } from './go-test.task';
import { GenerateSbomPipelineTask } from './generate-sbom.task';

describe('PipelineTask', () => {
  describe('toSpec() with no dependencies', () => {
    it('exposes the correct task name', () => {
      const task = new GoTestPipelineTask();
      expect(task.name).toBe('test');
    });

    it('omits runAfter from spec when there are no deps', () => {
      const task = new GoTestPipelineTask();
      const spec = task.toSpec() as Record<string, unknown>;
      expect(spec).not.toHaveProperty('runAfter');
    });

    it('includes the correct taskRef', () => {
      const task = new GoTestPipelineTask();
      const spec = task.toSpec() as Record<string, unknown>;
      expect(spec.taskRef).toEqual({ kind: 'Task', name: 'test-go' });
    });

    it('includes params binding', () => {
      const task = new GoTestPipelineTask();
      const spec = task.toSpec() as Record<string, unknown>;
      expect(Array.isArray(spec.params)).toBe(true);
      expect((spec.params as unknown[]).length).toBeGreaterThan(0);
    });

    it('includes workspace binding', () => {
      const task = new GoTestPipelineTask();
      const spec = task.toSpec() as Record<string, unknown>;
      expect(spec.workspaces).toEqual([{ name: 'workspace', workspace: 'workspace' }]);
    });
  });

  describe('toSpec() with a single runAfter dependency', () => {
    it('includes runAfter with the upstream task name', () => {
      const clone = new GitClonePipelineTask();
      const test = new GoTestPipelineTask({ runAfter: clone });
      const spec = test.toSpec() as Record<string, unknown>;
      expect(spec.runAfter).toEqual(['clone']);
    });
  });

  describe('toSpec() with an array of runAfter dependencies', () => {
    it('includes all upstream task names in runAfter', () => {
      const clone = new GitClonePipelineTask();
      const sbom = new GenerateSbomPipelineTask({ runAfter: clone });
      // A task depending on both clone and sbom
      const test = new GoTestPipelineTask({ runAfter: [clone, sbom] });
      const spec = test.toSpec() as Record<string, unknown>;
      expect(spec.runAfter).toEqual(['clone', 'generate-sbom']);
    });
  });

  describe('GitClonePipelineTask', () => {
    it('defaults name to clone', () => {
      const task = new GitClonePipelineTask();
      expect(task.name).toBe('clone');
    });

    it('uses a git resolver taskRef (not a local Task)', () => {
      const task = new GitClonePipelineTask();
      const spec = task.toSpec() as Record<string, unknown>;
      expect((spec.taskRef as Record<string, unknown>).resolver).toBe('git');
    });

    it('accepts a custom step name', () => {
      const task = new GitClonePipelineTask({ name: 'fetch' });
      expect(task.name).toBe('fetch');
    });
  });
});
