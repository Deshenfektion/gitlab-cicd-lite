import { FakeExecutor, scriptFailure, success } from '@cicd/core';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from './testing.js';

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

let harness: TestHarness;

afterEach(() => {
  harness.context.close();
});

const setup = (executor: FakeExecutor): TestHarness => {
  harness = createTestHarness({}, executor);
  return harness;
};

async function createAndRun(executor: FakeExecutor): Promise<string> {
  setup(executor);

  const created = await request(harness.app).post('/api/pipelines').send({ config });
  const id = created.body.pipeline.id as string;

  await request(harness.app).post(`/api/pipelines/${id}/start`).expect(202);
  await harness.context.orchestrator.drain();

  return id;
}

const detail = (id: string) => request(harness.app).get(`/api/pipelines/${id}`);

describe('pipeline lifecycle', () => {
  it('runs a pipeline to success through the api', async () => {
    const id = await createAndRun(new FakeExecutor());
    const response = await detail(id);

    expect(response.body.pipeline.status).toBe('success');
    expect(response.body.jobs.map((job: { status: string }) => job.status)).toEqual([
      'success',
      'success',
    ]);
    expect(response.body.pipeline.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects starting a pipeline twice', async () => {
    const id = await createAndRun(new FakeExecutor());
    await request(harness.app).post(`/api/pipelines/${id}/start`).expect(409);
  });

  it('returns 404 when starting an unknown pipeline', async () => {
    setup(new FakeExecutor());
    await request(harness.app).post('/api/pipelines/missing/start').expect(404);
  });

  it('records a failure and marks the downstream job skipped', async () => {
    const id = await createAndRun(new FakeExecutor({ results: { compile: scriptFailure(2) } }));
    const response = await detail(id);

    expect(response.body.pipeline.status).toBe('failed');
    expect(response.body.jobs[0]).toMatchObject({
      status: 'failed',
      exitCode: 2,
      failureReason: 'script_failure',
    });
    expect(response.body.jobs[1].status).toBe('skipped');
  });

  it('serves the logs a job produced', async () => {
    const id = await createAndRun(new FakeExecutor());
    const jobs = (await detail(id)).body.jobs as Array<{ id: string }>;

    const response = await request(harness.app).get(`/api/jobs/${jobs[0]?.id}/logs`);

    expect(response.status).toBe(200);
    expect(response.body.lines.map((line: { message: string }) => line.message)).toEqual([
      'running compile',
    ]);
    expect(response.body.nextCursor).toBeGreaterThan(0);
  });

  it('supports incremental log fetching with a cursor', async () => {
    const id = await createAndRun(new FakeExecutor());
    const jobs = (await detail(id)).body.jobs as Array<{ id: string }>;

    const first = await request(harness.app).get(`/api/jobs/${jobs[0]?.id}/logs`);
    const second = await request(harness.app).get(
      `/api/jobs/${jobs[0]?.id}/logs?after=${first.body.nextCursor}`,
    );

    expect(second.body.lines).toEqual([]);
  });

  it('returns 404 for logs of an unknown job', async () => {
    setup(new FakeExecutor());
    await request(harness.app).get('/api/jobs/missing/logs').expect(404);
  });

  it('retries a failed job and lets the pipeline finish', async () => {
    const id = await createAndRun(
      new FakeExecutor({ results: { compile: [scriptFailure(1), success()] } }),
    );
    expect((await detail(id)).body.pipeline.status).toBe('failed');

    const jobs = (await detail(id)).body.jobs as Array<{ id: string; name: string }>;
    const compile = jobs.find((job) => job.name === 'compile');

    await request(harness.app).post(`/api/jobs/${compile?.id}/retry`).expect(202);
    await harness.context.orchestrator.drain();

    const response = await detail(id);
    expect(response.body.pipeline.status).toBe('success');
    expect(response.body.jobs.map((job: { status: string }) => job.status)).toEqual([
      'success',
      'success',
    ]);
  });

  it('retries a whole pipeline and keeps successful jobs untouched', async () => {
    const id = await createAndRun(
      new FakeExecutor({ results: { unit: [scriptFailure(1), success()] } }),
    );
    expect((await detail(id)).body.pipeline.status).toBe('failed');

    await request(harness.app).post(`/api/pipelines/${id}/retry`).expect(202);
    await harness.context.orchestrator.drain();

    const response = await detail(id);
    expect(response.body.pipeline.status).toBe('success');

    const compile = response.body.jobs.find((job: { name: string }) => job.name === 'compile');
    expect(compile.attempt).toBe(1);
  });

  it('refuses to retry a pipeline that has nothing to retry', async () => {
    const id = await createAndRun(new FakeExecutor());
    await request(harness.app).post(`/api/pipelines/${id}/retry`).expect(409);
  });

  it('reports the artifacts a job published', async () => {
    const id = await createAndRun(new FakeExecutor({ artifacts: { compile: 'build-output' } }));
    const jobs = (await detail(id)).body.jobs as Array<{ id: string; name: string }>;
    const compile = jobs.find((job) => job.name === 'compile');

    const response = await request(harness.app).get(`/api/jobs/${compile?.id}/artifacts`);

    expect(response.body.artifacts).toHaveLength(1);
    expect(response.body.artifacts[0]).toMatchObject({
      name: 'build-output',
      jobName: 'compile',
      expired: false,
    });
    expect(response.body.artifacts[0].downloadUrl).toMatch(/^\/api\/artifacts\/.+\/download$/);
  });

  it('lists artifacts for the whole pipeline', async () => {
    const id = await createAndRun(new FakeExecutor({ artifacts: { compile: 'a', unit: 'b' } }));

    const response = await request(harness.app).get(`/api/pipelines/${id}/artifacts`);
    expect(response.body.artifacts.map((artifact: { name: string }) => artifact.name)).toEqual([
      'a',
      'b',
    ]);
  });

  it('passes the artifact producing dependencies to the executor', async () => {
    const executor = new FakeExecutor({ artifacts: { compile: 'build-output' } });
    setup(executor);

    const created = await request(harness.app)
      .post('/api/pipelines')
      .send({
        config: `
jobs:
  compile:
    stage: build
    script: make
    artifacts:
      paths: [dist]
  unit:
    stage: test
    needs: [compile]
    script: make test
`,
      });

    await request(harness.app).post(`/api/pipelines/${created.body.pipeline.id}/start`);
    await harness.context.orchestrator.drain();

    expect(executor.restores).toEqual([
      { jobName: 'compile', sources: [] },
      { jobName: 'unit', sources: ['compile'] },
    ]);
  });
});

describe('runners', () => {
  it('reports the registered local runner', async () => {
    setup(new FakeExecutor());
    const response = await request(harness.app).get('/api/runners');

    expect(response.body.runners).toHaveLength(1);
    expect(response.body.runners[0]).toMatchObject({
      id: 'local',
      executor: 'fake',
      status: 'online',
      activePipelines: 0,
    });
  });

  it('returns 404 for an unknown runner', async () => {
    setup(new FakeExecutor());
    await request(harness.app).get('/api/runners/nope').expect(404);
  });
});
