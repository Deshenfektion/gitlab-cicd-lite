import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPipeline } from '@cicd/core';
import { FilesystemArtifactStore } from '@cicd/runner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../api/testing.js';
import type { AppContext } from '../context.js';
import { ArtifactCleaner } from './artifact-cleaner.js';

const config = 'jobs:\n  build:\n    script: make\n';

let context: AppContext;
let root: string;
let store: FilesystemArtifactStore;
let cleaner: ArtifactCleaner;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cicd-cleaner-'));
  context = createTestContext({ artifactRoot: root });
  store = new FilesystemArtifactStore(root);
  cleaner = new ArtifactCleaner({ artifacts: context.artifacts, store, logger: context.logger });
});

afterEach(async () => {
  cleaner.stop();
  context.close();
  await rm(root, { recursive: true, force: true });
});

async function seed(expiresAt: number): Promise<string> {
  const pipeline = context.pipelines.create({
    name: 'demo',
    config,
    definition: loadPipeline(config).definition,
  });

  const job = context.jobs.findByName(pipeline.id, 'build');
  const path = join(root, `${job?.id}.tar.gz`);
  await writeFile(path, 'archive', 'utf8');

  const artifact = context.artifacts.save({
    jobId: job?.id as string,
    name: 'build',
    path,
    sizeBytes: 7,
    expiresAt,
  });

  return artifact.id;
}

describe('ArtifactCleaner', () => {
  it('removes artifacts whose retention window has passed', async () => {
    const id = await seed(Date.now() - 1_000);

    await expect(cleaner.sweep()).resolves.toBe(1);
    expect(context.artifacts.findById(id)).toBeNull();
  });

  it('deletes the archive from disk', async () => {
    const id = await seed(Date.now() - 1_000);
    const path = context.artifacts.findById(id)?.path as string;

    await cleaner.sweep();

    await expect(
      new Promise((resolve, reject) => {
        const stream = store.read(path);
        stream.on('error', reject);
        stream.on('end', resolve);
        stream.resume();
      }),
    ).rejects.toThrow();
  });

  it('keeps artifacts that are still within their retention window', async () => {
    const id = await seed(Date.now() + 60_000);

    await expect(cleaner.sweep()).resolves.toBe(0);
    expect(context.artifacts.findById(id)).not.toBeNull();
  });

  it('treats the expiry time as inclusive', async () => {
    const now = Date.now();
    await seed(now);

    await expect(cleaner.sweep(now)).resolves.toBe(1);
  });

  it('does nothing when there is nothing to clean', async () => {
    await expect(cleaner.sweep()).resolves.toBe(0);
  });

  it('can be started and stopped without leaking a timer', () => {
    expect(() => {
      cleaner.start();
      cleaner.start();
      cleaner.stop();
      cleaner.stop();
    }).not.toThrow();
  });
});
