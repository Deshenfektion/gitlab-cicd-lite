import type { ArtifactStore } from '@cicd/runner';
import type { Logger } from '../logger.js';
import type { ArtifactRepository } from '../repositories/artifacts.js';

export interface ArtifactCleanerDeps {
  readonly artifacts: ArtifactRepository;
  readonly store: ArtifactStore;
  readonly logger: Logger;
  readonly intervalMs?: number;
}

export class ArtifactCleaner {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: ArtifactCleanerDeps) {}

  async sweep(now = Date.now()): Promise<number> {
    const expired = this.deps.artifacts.listExpired(now);

    for (const artifact of expired) {
      await this.deps.store.removeArtifact(artifact.path);
      this.deps.artifacts.deleteById(artifact.id);
    }

    if (expired.length > 0) {
      this.deps.logger.info({ removed: expired.length }, 'expired artifacts removed');
    }

    return expired.length;
  }

  start(): void {
    if (this.timer !== null) {
      return;
    }

    this.timer = setInterval(
      () => {
        void this.sweep().catch((error: unknown) => {
          this.deps.logger.error({ err: error }, 'artifact sweep failed');
        });
      },
      this.deps.intervalMs ?? 15 * 60 * 1000,
    );

    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
