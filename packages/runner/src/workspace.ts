import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export class WorkspaceManager {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  pathFor(pipelineId: string, jobName: string): string {
    return join(this.root, pipelineId, jobName);
  }

  async create(pipelineId: string, jobName: string): Promise<string> {
    const path = this.pathFor(pipelineId, jobName);
    await rm(path, { recursive: true, force: true });
    await mkdir(path, { recursive: true });
    return path;
  }

  async remove(pipelineId: string): Promise<void> {
    await rm(join(this.root, pipelineId), { recursive: true, force: true });
  }
}
