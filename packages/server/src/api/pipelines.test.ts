import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

beforeEach(() => {
  harness = createTestHarness();
});

afterEach(() => {
  harness.context.close();
});

const create = (body: Record<string, unknown> = { config }) =>
  request(harness.app).post('/api/pipelines').send(body);

describe('GET /api/health', () => {
  it('reports that the server is up', async () => {
    const response = await request(harness.app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('POST /api/pipelines', () => {
  it('creates a pending pipeline', async () => {
    const response = await create({ name: 'demo', config });

    expect(response.status).toBe(201);
    expect(response.body.pipeline).toMatchObject({ name: 'demo', status: 'pending' });
    expect(response.body.pipeline.id).toEqual(expect.any(String));
  });

  it('generates a name when none is given', async () => {
    const response = await create();
    expect(response.body.pipeline.name).toMatch(/^pipeline-/);
  });

  it('accepts a raw yaml body', async () => {
    const response = await request(harness.app)
      .post('/api/pipelines?name=from-yaml')
      .set('Content-Type', 'text/yaml')
      .send(config);

    expect(response.status).toBe(201);
    expect(response.body.pipeline.name).toBe('from-yaml');
  });

  it('rejects a request without a configuration', async () => {
    const response = await create({});
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/config/);
  });

  it('reports configuration problems with their paths', async () => {
    const response = await create({ config: 'jobs:\n  a:\n    scritp: typo\n' });

    expect(response.status).toBe(422);
    expect(response.body.issues.length).toBeGreaterThan(0);
    expect(response.body.issues[0].path).toContain('jobs.a');
  });

  it('rejects a pipeline with a dependency cycle', async () => {
    const response = await create({
      config: 'jobs:\n  a:\n    script: e\n    needs: [b]\n  b:\n    script: e\n    needs: [a]\n',
    });

    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body.issues)).toContain('cycle');
  });
});

describe('GET /api/pipelines', () => {
  it('returns an empty list initially', async () => {
    const response = await request(harness.app).get('/api/pipelines');
    expect(response.body.pipelines).toEqual([]);
  });

  it('lists created pipelines newest first', async () => {
    await create({ name: 'first', config });
    await create({ name: 'second', config });

    const response = await request(harness.app).get('/api/pipelines');
    expect(response.body.pipelines.map((pipeline: { name: string }) => pipeline.name)).toEqual([
      'second',
      'first',
    ]);
  });

  it('honours the limit parameter', async () => {
    await create();
    await create();

    const response = await request(harness.app).get('/api/pipelines?limit=1');
    expect(response.body.pipelines).toHaveLength(1);
  });
});

describe('GET /api/pipelines/:id', () => {
  it('returns the pipeline together with its graph', async () => {
    const created = await create({ name: 'demo', config });
    const response = await request(harness.app).get(`/api/pipelines/${created.body.pipeline.id}`);

    expect(response.status).toBe(200);
    expect(response.body.jobs.map((job: { name: string }) => job.name)).toEqual([
      'compile',
      'unit',
    ]);
    expect(response.body.edges).toEqual([{ from: 'compile', to: 'unit' }]);
    expect(response.body.layers).toEqual([['compile'], ['unit']]);
  });

  it('exposes the job fields the ui needs', async () => {
    const created = await create();
    const response = await request(harness.app).get(`/api/pipelines/${created.body.pipeline.id}`);

    expect(response.body.jobs[0]).toMatchObject({
      name: 'compile',
      stage: 'build',
      status: 'pending',
      attempt: 0,
      allowFailure: false,
      exitCode: null,
      durationMs: null,
    });
  });

  it('returns 404 for an unknown pipeline', async () => {
    const response = await request(harness.app).get('/api/pipelines/missing');
    expect(response.status).toBe(404);
    expect(response.body.error).toContain('missing');
  });
});

describe('request errors', () => {
  it('reports malformed json as a client error', async () => {
    const response = await request(harness.app)
      .post('/api/pipelines')
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual(expect.any(String));
  });

  it('rejects a body that exceeds the size limit', async () => {
    const response = await request(harness.app)
      .post('/api/pipelines')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ config: 'x'.repeat(400_000) }));

    expect(response.status).toBe(413);
  });

  it('still reports unexpected failures as server errors', async () => {
    harness.context.pipelines.list = () => {
      throw new Error('database exploded');
    };

    const response = await request(harness.app).get('/api/pipelines');
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('database exploded');
  });
});
