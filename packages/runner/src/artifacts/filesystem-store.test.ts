import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilesystemArtifactStore } from './filesystem-store.js';

let root: string;
let workspace: string;
let store: FilesystemArtifactStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cicd-artifacts-'));
  workspace = join(root, 'workspace');
  await mkdir(workspace, { recursive: true });
  store = new FilesystemArtifactStore(join(root, 'store'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const write = async (relative: string, content: string): Promise<void> => {
  const target = join(workspace, relative);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, content, 'utf8');
};

describe('FilesystemArtifactStore', () => {
  it('archives a single file and reports its size', async () => {
    await write('report.txt', 'all green');

    const stored = await store.save('p1', 'test', 'reports', workspace, ['report.txt']);

    expect(stored?.name).toBe('reports');
    expect(stored?.sizeBytes).toBeGreaterThan(0);
    expect(stored?.path).toBe(store.pathFor('p1', 'test'));
  });

  it('restores an archive into another workspace', async () => {
    await write('dist/app.js', 'console.log(1)');
    await store.save('p1', 'build', 'build', workspace, ['dist']);

    const target = join(root, 'other');
    await expect(store.restore('p1', 'build', target)).resolves.toBe(true);
    await expect(readFile(join(target, 'dist', 'app.js'), 'utf8')).resolves.toBe('console.log(1)');
  });

  it('round trips a directory tree with several files', async () => {
    await write('dist/a.txt', 'a');
    await write('dist/nested/b.txt', 'b');
    await store.save('p1', 'build', 'build', workspace, ['dist']);

    const target = join(root, 'restored');
    await store.restore('p1', 'build', target);

    await expect(readFile(join(target, 'dist', 'a.txt'), 'utf8')).resolves.toBe('a');
    await expect(readFile(join(target, 'dist', 'nested', 'b.txt'), 'utf8')).resolves.toBe('b');
  });

  it('archives several paths into one artifact', async () => {
    await write('dist/app.js', 'app');
    await write('coverage.xml', 'coverage');
    await store.save('p1', 'build', 'build', workspace, ['dist', 'coverage.xml']);

    const target = join(root, 'restored');
    await store.restore('p1', 'build', target);

    await expect(readFile(join(target, 'dist', 'app.js'), 'utf8')).resolves.toBe('app');
    await expect(readFile(join(target, 'coverage.xml'), 'utf8')).resolves.toBe('coverage');
  });

  it('skips paths that the job never produced', async () => {
    await write('dist/app.js', 'app');

    const stored = await store.save('p1', 'build', 'build', workspace, ['dist', 'missing']);
    expect(stored).not.toBeNull();

    const target = join(root, 'restored');
    await store.restore('p1', 'build', target);
    await expect(readFile(join(target, 'dist', 'app.js'), 'utf8')).resolves.toBe('app');
  });

  it('returns null when nothing matched', async () => {
    await expect(store.save('p1', 'build', 'build', workspace, ['nope'])).resolves.toBeNull();
  });

  it('reports a missing archive on restore', async () => {
    await expect(store.restore('p1', 'never-ran', join(root, 'target'))).resolves.toBe(false);
  });

  it('keeps artifacts of different jobs apart', async () => {
    await write('a.txt', 'from a');
    await store.save('p1', 'a', 'a', workspace, ['a.txt']);

    await rm(join(workspace, 'a.txt'));
    await write('b.txt', 'from b');
    await store.save('p1', 'b', 'b', workspace, ['b.txt']);

    const target = join(root, 'restored');
    await store.restore('p1', 'a', target);

    await expect(readFile(join(target, 'a.txt'), 'utf8')).resolves.toBe('from a');
    await expect(readFile(join(target, 'b.txt'), 'utf8')).rejects.toThrow();
  });

  it('streams a stored archive for download', async () => {
    await write('report.txt', 'all green');
    const stored = await store.save('p1', 'test', 'reports', workspace, ['report.txt']);

    const chunks: Buffer[] = [];
    for await (const chunk of store.read(stored?.path as string)) {
      chunks.push(chunk as Buffer);
    }

    expect(Buffer.concat(chunks).length).toBe(stored?.sizeBytes);
  });

  it('removes every artifact of a pipeline', async () => {
    await write('report.txt', 'x');
    await store.save('p1', 'test', 'reports', workspace, ['report.txt']);

    await store.removePipeline('p1');

    await expect(store.restore('p1', 'test', join(root, 'restored'))).resolves.toBe(false);
  });

  it('removes a single artifact', async () => {
    await write('report.txt', 'x');
    const stored = await store.save('p1', 'test', 'reports', workspace, ['report.txt']);

    await store.removeArtifact(stored?.path as string);

    await expect(store.restore('p1', 'test', join(root, 'restored'))).resolves.toBe(false);
  });
});
