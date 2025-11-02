import type { JobContext } from '@cicd/core';
import type { ArtifactStore } from './store.js';

export class ArtifactCoordinator {
  constructor(private readonly store: ArtifactStore) {}

  async restoreDependencies(context: JobContext, workspace: string): Promise<void> {
    for (const source of context.artifactSources) {
      const restored = await this.store.restore(context.pipelineId, source, workspace);
      if (restored) {
        context.onLog({ stream: 'stdout', text: `Restoring artifacts from ${source}` });
      }
    }
  }

  async collect(context: JobContext, workspace: string): Promise<void> {
    const definition = context.definition.artifacts;
    if (definition === null) {
      return;
    }

    const stored = await this.store.save(
      context.pipelineId,
      context.jobName,
      definition.name,
      workspace,
      definition.paths,
    );

    if (stored === null) {
      context.onLog({
        stream: 'stderr',
        text: `No files matched the artifact paths: ${definition.paths.join(', ')}`,
      });
      return;
    }

    context.onLog({
      stream: 'stdout',
      text: `Uploading artifact "${stored.name}" (${stored.sizeBytes} bytes)`,
    });

    context.onArtifact({
      name: stored.name,
      path: stored.path,
      sizeBytes: stored.sizeBytes,
      expiresAt: Date.now() + definition.expireInMs,
    });
  }
}
