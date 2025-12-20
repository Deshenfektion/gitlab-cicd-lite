import { describe, expect, it } from 'vitest';
import type { DockerClient, ManagedContainer } from './docker/client.js';
import { FakeDockerClient } from './docker/fake-client.js';
import { PIPELINE_LABEL, reapOrphanedContainers } from './reaper.js';

const orphan = (id: string, labels: Record<string, string> = {}): ManagedContainer => ({
  id,
  labels: { [PIPELINE_LABEL]: 'p1', ...labels },
});

describe('reapOrphanedContainers', () => {
  it('removes every container this system created', async () => {
    const client = new FakeDockerClient({ orphans: [orphan('a'), orphan('b')] });

    const result = await reapOrphanedContainers(client);

    expect(result.removed).toEqual(['a', 'b']);
    expect(result.failed).toEqual([]);
    expect(client.removed).toEqual(['a', 'b']);
  });

  it('does nothing when there is nothing to reap', async () => {
    const client = new FakeDockerClient();

    const result = await reapOrphanedContainers(client);

    expect(result.removed).toEqual([]);
    expect(client.removed).toEqual([]);
  });

  it('only looks at containers carrying the pipeline label', async () => {
    const client = new FakeDockerClient({
      orphans: [orphan('mine'), { id: 'someone-elses', labels: { app: 'unrelated' } }],
    });

    const result = await reapOrphanedContainers(client);

    expect(result.removed).toEqual(['mine']);
  });

  it('keeps going when one container cannot be removed', async () => {
    const base = new FakeDockerClient({ orphans: [orphan('a'), orphan('b'), orphan('c')] });
    const client: DockerClient = {
      ...base,
      listManaged: (label) => base.listManaged(label),
      removeContainer: async (id) => {
        if (id === 'b') {
          throw new Error('container is locked');
        }
        await base.removeContainer(id);
      },
    };

    const result = await reapOrphanedContainers(client);

    expect(result.removed).toEqual(['a', 'c']);
    expect(result.failed).toEqual(['b']);
  });
});
