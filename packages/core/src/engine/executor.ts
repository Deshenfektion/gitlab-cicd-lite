import type { JobDefinition } from '../config/types.js';
import type { JobOutcome } from './outcome.js';

export interface LogLine {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

export interface CollectedArtifact {
  readonly name: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly expiresAt: number;
}

export interface JobContext {
  readonly pipelineId: string;
  readonly jobName: string;
  readonly attempt: number;
  readonly definition: JobDefinition;
  readonly artifactSources: readonly string[];
  readonly signal: AbortSignal;
  onLog(line: LogLine): void;
  onArtifact(artifact: CollectedArtifact): void;
}

export interface JobExecutor {
  readonly id: string;
  run(context: JobContext): Promise<JobOutcome>;
}
