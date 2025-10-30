import { FakeExecutor, loadPipeline, scriptFailure, success } from '@cicd/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../api/testing.js';
import type { AppContext } from '../context.js';
import { PipelineNotFoundError, PipelineNotStartableError } from './orchestrator.js';

const config = `
stages: [build, test]
jobs:
  compile:
    stage: build
    script: make
  unit:
    stage: test
    needs: [compile]
    script: make test
`;

let context: AppContext;

const withExecutor = (executor: FakeExecutor): AppContext => {
  context = createTestContext({}, executor);
  return context;
};

const createPipeline = (source = config) =>
  context.pipelines.create({
    name: 'demo',
    config: source,
    definition: loadPipeline(source).definition,
  });

beforeEach(() => {
  context = createTestContext({}, new FakeExecutor());
});

afterEach(() => {
  context.close();
});

describe('Orchestrator', () => {
  it('runs a pipeline to success and records every job', async () => {
    const pipeline = createPipeline();

    await expect(context.orchestrator.start(pipeline.id)).resolves.toBe('success');

    expect(context.pipelines.findById(pipeline.id)?.status).toBe('success');
    for (const job of context.pipelines.jobsOf(pipeline.id)) {
      expect(job.status).toBe('success');
      expect(job.attempt).toBe(1);
      expect(job.startedAt).not.toBeNull();
      expect(job.finishedAt).not.toBeNull();
    }
  });

  it('stamps the pipeline start and finish times', async () => {
    const pipeline = createPipeline();
    await context.orchestrator.start(pipeline.id);

    const stored = context.pipelines.findById(pipeline.id);
    expect(stored?.startedAt).not.toBeNull();
    expect(stored?.finishedAt).not.toBeNull();
  });

  it('persists the logs a job produced', async () => {
    const pipeline = createPipeline();
    await context.orchestrator.start(pipeline.id);

    const compile = context.jobs.findByName(pipeline.id, 'compile');
    const lines = context.logs.listByJob(compile?.id as string);

    expect(lines.map((line) => line.message)).toEqual(['running compile']);
    expect(lines[0]?.attempt).toBe(1);
    expect(lines[0]?.stream).toBe('stdout');
  });

  it('records a failure and skips the downstream job', async () => {
    withExecutor(new FakeExecutor({ results: { compile: scriptFailure(2) } }));
    const pipeline = createPipeline();

    await expect(context.orchestrator.start(pipeline.id)).resolves.toBe('failed');

    expect(context.jobs.findByName(pipeline.id, 'compile')).toMatchObject({
      status: 'failed',
      exitCode: 2,
      failureReason: 'script_failure',
    });
    expect(context.jobs.findByName(pipeline.id, 'unit')?.status).toBe('skipped');
  });

  it('keeps a retried job pending between attempts', async () => {
    withExecutor(new FakeExecutor({ results: { compile: [scriptFailure(1), success()] } }));
    const retried = config.replace('    script: make\n', '    script: make\n    retry: 1\n');
    const pipeline = createPipeline(retried);

    await expect(context.orchestrator.start(pipeline.id)).resolves.toBe('success');

    const compile = context.jobs.findByName(pipeline.id, 'compile');
    expect(compile).toMatchObject({ status: 'success', attempt: 2 });
  });

  it('separates logs by attempt', async () => {
    withExecutor(new FakeExecutor({ results: { compile: [scriptFailure(1), success()] } }));
    const retried = config.replace('    script: make\n', '    script: make\n    retry: 1\n');
    const pipeline = createPipeline(retried);
    await context.orchestrator.start(pipeline.id);

    const compile = context.jobs.findByName(pipeline.id, 'compile');
    const attempts = context.logs.listByJob(compile?.id as string).map((line) => line.attempt);
    expect(attempts).toEqual([1, 2]);
  });

  it('refuses to start an unknown pipeline', () => {
    expect(() => context.orchestrator.start('missing')).toThrow(PipelineNotFoundError);
  });

  it('refuses to start a pipeline twice', async () => {
    const pipeline = createPipeline();
    const first = context.orchestrator.start(pipeline.id);

    expect(() => context.orchestrator.start(pipeline.id)).toThrow(PipelineNotStartableError);
    await first;
  });

  it('refuses to restart a finished pipeline', async () => {
    const pipeline = createPipeline();
    await context.orchestrator.start(pipeline.id);

    expect(() => context.orchestrator.start(pipeline.id)).toThrow(PipelineNotStartableError);
  });

  it('reports whether a pipeline is currently running', async () => {
    const pipeline = createPipeline();
    expect(context.orchestrator.isRunning(pipeline.id)).toBe(false);

    const running = context.orchestrator.start(pipeline.id);
    expect(context.orchestrator.isRunning(pipeline.id)).toBe(true);

    await running;
    expect(context.orchestrator.isRunning(pipeline.id)).toBe(false);
    expect(context.orchestrator.activeCount).toBe(0);
  });

  it('cancels a running pipeline and persists the cancelled state', async () => {
    const controller = new AbortController();
    withExecutor(
      new FakeExecutor({
        hold: (job) =>
          new Promise((resolve) => {
            controller.abort();
            job.signal.addEventListener('abort', () => resolve());
          }),
      }),
    );

    const pipeline = createPipeline();
    const running = context.orchestrator.start(pipeline.id);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(context.orchestrator.cancel(pipeline.id)).toBe(true);

    await expect(running).resolves.toBe('canceled');
    expect(context.pipelines.findById(pipeline.id)?.status).toBe('canceled');
    expect(context.jobs.findByName(pipeline.id, 'unit')?.status).toBe('canceled');
  });

  it('reports cancelling a pipeline that is not running', () => {
    const pipeline = createPipeline();
    expect(context.orchestrator.cancel(pipeline.id)).toBe(false);
  });
});
