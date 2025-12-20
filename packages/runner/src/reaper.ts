import type { DockerClient } from './docker/client.js';

export const PIPELINE_LABEL = 'cicd.pipeline';

export interface ReapResult {
  readonly removed: readonly string[];
  readonly failed: readonly string[];
}

export async function reapOrphanedContainers(client: DockerClient): Promise<ReapResult> {
  const managed = await client.listManaged(PIPELINE_LABEL);
  const removed: string[] = [];
  const failed: string[] = [];

  for (const container of managed) {
    try {
      await client.removeContainer(container.id);
      removed.push(container.id);
    } catch {
      failed.push(container.id);
    }
  }

  return { removed, failed };
}
