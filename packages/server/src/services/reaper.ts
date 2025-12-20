import { createDockerClient, reapOrphanedContainers } from '@cicd/runner';
import type { AppContext } from '../context.js';

export async function reapOrphanedJobContainers(context: AppContext): Promise<number> {
  const client = createDockerClient({
    kind: context.config.executor,
    workspaceRoot: context.config.workspaceRoot,
    artifactRoot: context.config.artifactRoot,
    ...(context.config.dockerSocket === undefined
      ? {}
      : { dockerSocket: context.config.dockerSocket }),
  });

  if (client === null) {
    return 0;
  }

  try {
    const result = await reapOrphanedContainers(client);
    if (result.removed.length > 0 || result.failed.length > 0) {
      context.logger.warn(
        { removed: result.removed.length, failed: result.failed.length },
        'removed job containers left behind by a previous run',
      );
    }
    return result.removed.length;
  } catch (error) {
    context.logger.warn({ err: error }, 'could not reap orphaned job containers');
    return 0;
  }
}
