import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JobContext, JobDefinition, JobOutcome, LogLine } from '@cicd/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeDockerClient, type FakeDockerClientOptions } from '../docker/fake-client.js';
import { WorkspaceManager } from '../workspace.js';
import { CONTAINER_WORKDIR, DockerExecutor } from './docker.js';

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'cicd-docker-'));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

const definition = (overrides: Partial<JobDefinition> = {}): JobDefinition => ({
  name: 'build',
  stage: 'build',
  image: 'node:22-alpine',
  script: ['npm ci'],
  needs: [],
  artifacts: null,
  retry: { max: 0, when: ['always'] },
  timeoutMs: 60_000,
  allowFailure: false,
  ...overrides,
});

interface Harness {
  readonly client: FakeDockerClient;
  readonly outcome: JobOutcome;
  readonly lines: readonly LogLine[];
}

async function execute(
  options: FakeDockerClientOptions = {},
  job: Partial<JobDefinition> = {},
  signal = new AbortController().signal,
): Promise<Harness> {
  const client = new FakeDockerClient(options);
  const executor = new DockerExecutor({ client, workspaces: new WorkspaceManager(workspaceRoot) });
  const lines: LogLine[] = [];

  const context: JobContext = {
    pipelineId: 'p1',
    jobName: 'build',
    attempt: 1,
    definition: definition(job),
    signal,
    onLog: (line) => lines.push(line),
  };

  return { client, outcome: await executor.run(context), lines };
}

describe('DockerExecutor', () => {
  it('succeeds when the container exits with zero', async () => {
    const { outcome } = await execute({ images: ['node:22-alpine'] });
    expect(outcome).toEqual({ kind: 'success', exitCode: 0 });
  });

  it('pulls the image when it is missing locally', async () => {
    const { client, lines } = await execute();
    expect(client.pulled).toEqual(['node:22-alpine']);
    expect(lines.map((line) => line.text)).toContain('Pulling image node:22-alpine');
  });

  it('does not pull an image that is already present', async () => {
    const { client } = await execute({ images: ['node:22-alpine'] });
    expect(client.pulled).toEqual([]);
  });

  it('mounts the job workspace and runs the script through a shell', async () => {
    const { client } = await execute({ images: ['node:22-alpine'] });
    const spec = client.created[0];

    expect(spec?.workingDir).toBe(CONTAINER_WORKDIR);
    expect(spec?.binds).toEqual([`${join(workspaceRoot, 'p1', 'build')}:${CONTAINER_WORKDIR}`]);
    expect(spec?.command[0]).toBe('/bin/sh');
    expect(spec?.command[2]).toContain('npm ci');
  });

  it('labels containers so they can be traced back to a job', async () => {
    const { client } = await execute({ images: ['node:22-alpine'] });
    expect(client.created[0]?.labels).toEqual({
      'cicd.pipeline': 'p1',
      'cicd.job': 'build',
      'cicd.attempt': '1',
    });
  });

  it('passes CI environment variables into the container', async () => {
    const { client } = await execute({ images: ['node:22-alpine'] });
    expect(client.created[0]?.env).toContain('CI=true');
    expect(client.created[0]?.env).toContain('CI_JOB_NAME=build');
  });

  it('separates container stdout from stderr', async () => {
    const { lines } = await execute({
      images: ['node:22-alpine'],
      script: {
        output: [
          ['stdout', 'installing\n'],
          ['stderr', 'deprecated\n'],
        ],
      },
    });

    expect(lines).toContainEqual({ stream: 'stdout', text: 'installing' });
    expect(lines).toContainEqual({ stream: 'stderr', text: 'deprecated' });
  });

  it('reports a non zero exit code as a script failure', async () => {
    const { outcome } = await execute({ images: ['node:22-alpine'], script: { exitCode: 3 } });
    expect(outcome).toMatchObject({ kind: 'failure', reason: 'script_failure', exitCode: 3 });
  });

  it('removes the container after a successful run', async () => {
    const { client } = await execute({ images: ['node:22-alpine'] });
    expect(client.removed).toEqual(['container-1']);
  });

  it('removes the container after a failed run', async () => {
    const { client } = await execute({ images: ['node:22-alpine'], script: { exitCode: 1 } });
    expect(client.removed).toEqual(['container-1']);
  });

  it('stops and removes the container when the job is aborted', async () => {
    const controller = new AbortController();
    const pending = execute(
      { images: ['node:22-alpine'], script: { hangUntilStopped: true } },
      {},
      controller.signal,
    );

    setTimeout(() => controller.abort(), 20);
    const { client, outcome } = await pending;

    expect(client.stopped).toEqual(['container-1']);
    expect(client.removed).toEqual(['container-1']);
    expect(outcome).toMatchObject({ kind: 'failure', reason: 'runner_failure' });
  });

  it('turns a docker error into a runner failure', async () => {
    const { outcome } = await execute({
      images: ['node:22-alpine'],
      failOnCreate: new Error('no such image'),
    });

    expect(outcome).toMatchObject({
      kind: 'failure',
      reason: 'runner_failure',
      message: 'no such image',
    });
  });

  it('uses the image configured on the job', async () => {
    const { client } = await execute({}, { image: 'python:3.12-slim' });
    expect(client.created[0]?.image).toBe('python:3.12-slim');
  });
});
