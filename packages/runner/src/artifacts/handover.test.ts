import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PipelineRun, loadPipeline, type CollectedArtifact } from '@cicd/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShellExecutor } from '../executors/shell.js';
import { WorkspaceManager } from '../workspace.js';
import { ArtifactCoordinator } from './coordinator.js';
import { FilesystemArtifactStore } from './filesystem-store.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cicd-handover-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface RunResult {
  readonly status: string;
  readonly artifacts: CollectedArtifact[];
  readonly output: string[];
}

async function run(yaml: string): Promise<RunResult> {
  const store = new FilesystemArtifactStore(join(root, 'artifacts'));
  const executor = new ShellExecutor({
    workspaces: new WorkspaceManager(join(root, 'workspaces')),
    artifacts: new ArtifactCoordinator(store),
  });

  const artifacts: CollectedArtifact[] = [];
  const output: string[] = [];

  const status = await new PipelineRun(loadPipeline(yaml).graph, executor, {
    pipelineId: 'p1',
    listener: {
      onJobArtifact: (_name, _attempt, artifact) => artifacts.push(artifact),
      onJobLog: (name, _attempt, line) => output.push(`${name}: ${line.text}`),
    },
  }).start();

  return { status, artifacts, output };
}

describe('artifact handover', () => {
  it('makes a produced artifact available to a dependent job', async () => {
    const result = await run(`
jobs:
  build:
    script:
      - mkdir -p dist
      - echo compiled > dist/app.txt
    artifacts:
      paths: [dist]
  verify:
    needs: [build]
    script:
      - cat dist/app.txt
`);

    expect(result.status).toBe('success');
    expect(result.output).toContain('verify: compiled');
  });

  it('reports the collected artifact to the listener', async () => {
    const result = await run(`
jobs:
  build:
    script:
      - echo hello > out.txt
    artifacts:
      name: build-output
      paths: [out.txt]
      expire_in: 1d
`);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.name).toBe('build-output');
    expect(result.artifacts[0]?.sizeBytes).toBeGreaterThan(0);
    expect(result.artifacts[0]?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('does not leak artifacts to unrelated jobs', async () => {
    const result = await run(`
jobs:
  build:
    script:
      - echo secret > out.txt
    artifacts:
      paths: [out.txt]
  unrelated:
    script:
      - test ! -f out.txt
`);

    expect(result.status).toBe('success');
  });

  it('collects nothing when the job fails', async () => {
    const result = await run(`
jobs:
  build:
    script:
      - echo partial > out.txt
      - exit 1
    artifacts:
      paths: [out.txt]
`);

    expect(result.status).toBe('failed');
    expect(result.artifacts).toEqual([]);
  });

  it('gathers artifacts from several dependencies', async () => {
    const result = await run(`
jobs:
  left:
    script:
      - echo left > left.txt
    artifacts:
      paths: [left.txt]
  right:
    script:
      - echo right > right.txt
    artifacts:
      paths: [right.txt]
  join:
    needs: [left, right]
    script:
      - cat left.txt right.txt
`);

    expect(result.status).toBe('success');
    expect(result.output).toContain('join: left');
    expect(result.output).toContain('join: right');
  });

  it('warns when the artifact paths matched nothing', async () => {
    const result = await run(`
jobs:
  build:
    script:
      - echo nothing to see
    artifacts:
      paths: [dist]
`);

    expect(result.status).toBe('success');
    expect(result.artifacts).toEqual([]);
    expect(result.output.join('\n')).toContain('No files matched');
  });
});
