import { createReadStream } from 'node:fs';
import { access, mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { create, extract } from 'tar';
import type { ArtifactStore, StoredArtifact } from './store.js';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export class FilesystemArtifactStore implements ArtifactStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  pathFor(pipelineId: string, jobName: string): string {
    return join(this.root, pipelineId, `${jobName}.tar.gz`);
  }

  async save(
    pipelineId: string,
    jobName: string,
    artifactName: string,
    workspace: string,
    paths: readonly string[],
  ): Promise<StoredArtifact | null> {
    const present: string[] = [];
    for (const path of paths) {
      if (await exists(join(workspace, path))) {
        present.push(path);
      }
    }

    if (present.length === 0) {
      return null;
    }

    const destination = this.pathFor(pipelineId, jobName);
    await mkdir(join(this.root, pipelineId), { recursive: true });

    await create({ gzip: true, cwd: workspace, file: destination, portable: true }, present);

    const info = await stat(destination);
    return { name: artifactName, path: destination, sizeBytes: info.size };
  }

  async restore(pipelineId: string, jobName: string, target: string): Promise<boolean> {
    const source = this.pathFor(pipelineId, jobName);
    if (!(await exists(source))) {
      return false;
    }

    await mkdir(target, { recursive: true });
    await extract({ cwd: target, file: source });
    return true;
  }

  read(path: string): Readable {
    return createReadStream(path);
  }

  async removePipeline(pipelineId: string): Promise<void> {
    await rm(join(this.root, pipelineId), { recursive: true, force: true });
  }

  async removeArtifact(path: string): Promise<void> {
    await rm(path, { force: true });
  }
}
