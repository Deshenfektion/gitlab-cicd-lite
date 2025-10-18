import { loadPipeline } from '@cicd/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../db/connection.js';
import { migrate } from '../db/migrate.js';
import { JobRepository } from './jobs.js';
import { PipelineRepository } from './pipelines.js';

const config = `
stages: [build, test]
jobs:
  compile:
    stage: build
    script: make
    timeout: 5m
    retry: 2
  unit:
    stage: test
    needs: [compile]
    script: make test
    allow_failure: true
`;

let db: Db;
let pipelines: PipelineRepository;
let jobs: JobRepository;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  pipelines = new PipelineRepository(db);
  jobs = new JobRepository(db);
});

const create = (name = 'demo') =>
  pipelines.create({ name, config, definition: loadPipeline(config).definition });

describe('PipelineRepository', () => {
  it('stores a pipeline with all of its jobs', () => {
    const pipeline = create();

    expect(pipeline.status).toBe('pending');
    expect(pipeline.name).toBe('demo');
    expect(pipelines.jobsOf(pipeline.id).map((job) => job.name)).toEqual(['compile', 'unit']);
  });

  it('persists the job configuration that the engine needs', () => {
    const pipeline = create();
    const [compile, unit] = pipelines.jobsOf(pipeline.id);

    expect(compile).toMatchObject({
      stage: 'build',
      status: 'pending',
      attempt: 0,
      maxAttempts: 3,
      allowFailure: false,
      timeoutMs: 300_000,
    });
    expect(unit?.allowFailure).toBe(true);
  });

  it('stores dependency edges by job name', () => {
    const pipeline = create();
    expect(pipelines.edgesOf(pipeline.id)).toEqual([{ from: 'compile', to: 'unit' }]);
  });

  it('keeps the raw configuration for retries and inspection', () => {
    const pipeline = create();
    expect(pipelines.findById(pipeline.id)?.config).toBe(config);
  });

  it('returns null for an unknown pipeline', () => {
    expect(pipelines.findById('does-not-exist')).toBeNull();
  });

  it('lists pipelines newest first', () => {
    const first = create('first');
    const second = create('second');

    const listed = pipelines.list().map((pipeline) => pipeline.id);
    expect(listed.slice(0, 2)).toEqual([second.id, first.id]);
  });

  it('records the start time only once', () => {
    const pipeline = create();
    pipelines.updateStatus(pipeline.id, 'running');
    const started = pipelines.findById(pipeline.id)?.startedAt;

    pipelines.updateStatus(pipeline.id, 'running');
    expect(pipelines.findById(pipeline.id)?.startedAt).toBe(started);
    expect(started).not.toBeNull();
  });

  it('stamps a finish time for terminal statuses', () => {
    const pipeline = create();
    pipelines.updateStatus(pipeline.id, 'success');

    const stored = pipelines.findById(pipeline.id);
    expect(stored?.status).toBe('success');
    expect(stored?.finishedAt).not.toBeNull();
  });

  it('removes jobs and edges together with the pipeline', () => {
    const pipeline = create();
    expect(pipelines.deleteById(pipeline.id)).toBe(true);
    expect(pipelines.jobsOf(pipeline.id)).toEqual([]);
    expect(pipelines.edgesOf(pipeline.id)).toEqual([]);
  });
});

describe('JobRepository', () => {
  it('finds a job by pipeline and name', () => {
    const pipeline = create();
    expect(jobs.findByName(pipeline.id, 'compile')?.stage).toBe('build');
    expect(jobs.findByName(pipeline.id, 'ghost')).toBeNull();
  });

  it('records the attempt and start time when a job starts', () => {
    const pipeline = create();
    jobs.markStarted(pipeline.id, 'compile', 2);

    const job = jobs.findByName(pipeline.id, 'compile');
    expect(job).toMatchObject({ status: 'running', attempt: 2 });
    expect(job?.startedAt).not.toBeNull();
  });

  it('stores the failure details of a finished job', () => {
    const pipeline = create();
    jobs.markStarted(pipeline.id, 'compile', 1);
    jobs.markFinished(pipeline.id, 'compile', {
      status: 'failed',
      exitCode: 2,
      failureReason: 'script_failure',
      failureMessage: 'make failed',
    });

    expect(jobs.findByName(pipeline.id, 'compile')).toMatchObject({
      status: 'failed',
      exitCode: 2,
      failureReason: 'script_failure',
      failureMessage: 'make failed',
    });
  });

  it('clears stale failure details when a job is restarted', () => {
    const pipeline = create();
    jobs.markStarted(pipeline.id, 'compile', 1);
    jobs.markFinished(pipeline.id, 'compile', { status: 'failed', exitCode: 1 });
    jobs.markStarted(pipeline.id, 'compile', 2);

    const job = jobs.findByName(pipeline.id, 'compile');
    expect(job?.exitCode).toBeNull();
    expect(job?.finishedAt).toBeNull();
  });

  it('resets a set of jobs for a retry', () => {
    const pipeline = create();
    jobs.markStarted(pipeline.id, 'compile', 1);
    jobs.markFinished(pipeline.id, 'compile', { status: 'failed', exitCode: 1 });
    jobs.setStatus(pipeline.id, 'unit', 'skipped');

    jobs.resetForRetry(pipeline.id, ['compile', 'unit']);

    for (const name of ['compile', 'unit']) {
      expect(jobs.findByName(pipeline.id, name)).toMatchObject({
        status: 'pending',
        attempt: 0,
        exitCode: null,
      });
    }
  });

  it('ignores an empty retry reset', () => {
    const pipeline = create();
    expect(() => jobs.resetForRetry(pipeline.id, [])).not.toThrow();
  });
});
