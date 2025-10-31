import type { Readable } from 'node:stream';

export interface StoredArtifact {
  readonly name: string;
  readonly path: string;
  readonly sizeBytes: number;
}

export interface ArtifactStore {
  save(
    pipelineId: string,
    jobName: string,
    artifactName: string,
    workspace: string,
    paths: readonly string[],
  ): Promise<StoredArtifact | null>;

  restore(pipelineId: string, jobName: string, target: string): Promise<boolean>;

  read(path: string): Readable;

  removePipeline(pipelineId: string): Promise<void>;

  removeArtifact(path: string): Promise<void>;
}
