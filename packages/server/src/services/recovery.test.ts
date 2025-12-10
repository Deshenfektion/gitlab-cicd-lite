import { loadPipeline } from '@cicd/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../api/testing.js';
import type { AppContext } from '../context.js';
import { recoverInterruptedRuns } from './recovery.js';

const config = `
jobs:
  build:
    script: make
  test:
    script: make test
    needs: [build]
`;

let context: AppContext;

beforeEach(() => {
  context = createTestContext();
});

afterEach(() => {
  context.close();
});

function seed() {
  return context.pipelines.create({
    name: 'demo',
    config,
    definition: loadPipeline(config).definition,
  });
}

describe('recoverInterruptedRuns', () => {
  it('cancels a pipeline that was running when the server stopped', () => {
    const pipeline = seed();
    context.pipelines.updateStatus(pipeline.id, 'running');
    context.jobs.markStarted(pipeline.id, 'build', 1);

    const result = recoverInterruptedRuns(context.db, context.logger);

    expect(result).toEqual({ pipelines: 1, jobs: 2 });
    expect(context.pipelines.findById(pipeline.id)?.status).toBe('canceled');
  });

  it('explains why a running job was cancelled', () => {
    const pipeline = seed();
    context.pipelines.updateStatus(pipeline.id, 'running');
    context.jobs.markStarted(pipeline.id, 'build', 1);

    recoverInterruptedRuns(context.db, context.logger);

    expect(context.jobs.findByName(pipeline.id, 'build')).toMatchObject({
      status: 'canceled',
      failureReason: 'runner_failure',
      failureMessage: 'interrupted by a server restart',
    });
  });

  it('cancels the jobs that were still queued', () => {
    const pipeline = seed();
    context.pipelines.updateStatus(pipeline.id, 'running');
    context.jobs.markStarted(pipeline.id, 'build', 1);

    recoverInterruptedRuns(context.db, context.logger);

    expect(context.jobs.findByName(pipeline.id, 'test')?.status).toBe('canceled');
  });

  it('leaves pipelines that never started alone', () => {
    const pipeline = seed();

    expect(recoverInterruptedRuns(context.db, context.logger)).toEqual({ pipelines: 0, jobs: 0 });
    expect(context.pipelines.findById(pipeline.id)?.status).toBe('pending');
    expect(context.jobs.findByName(pipeline.id, 'build')?.status).toBe('pending');
  });

  it('leaves finished pipelines alone', () => {
    const pipeline = seed();
    context.jobs.markStarted(pipeline.id, 'build', 1);
    context.jobs.markFinished(pipeline.id, 'build', { status: 'success', exitCode: 0 });
    context.jobs.markStarted(pipeline.id, 'test', 1);
    context.jobs.markFinished(pipeline.id, 'test', { status: 'success', exitCode: 0 });
    context.pipelines.updateStatus(pipeline.id, 'success');

    expect(recoverInterruptedRuns(context.db, context.logger)).toEqual({ pipelines: 0, jobs: 0 });
    expect(context.pipelines.findById(pipeline.id)?.status).toBe('success');
  });

  it('is safe to run twice', () => {
    const pipeline = seed();
    context.pipelines.updateStatus(pipeline.id, 'running');
    context.jobs.markStarted(pipeline.id, 'build', 1);

    recoverInterruptedRuns(context.db, context.logger);
    expect(recoverInterruptedRuns(context.db, context.logger)).toEqual({ pipelines: 0, jobs: 0 });
  });
});
