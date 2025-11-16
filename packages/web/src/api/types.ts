export type JobStatus = 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'skipped';

export type PipelineStatus = 'pending' | 'running' | 'success' | 'failed' | 'canceled';

export interface Pipeline {
  readonly id: string;
  readonly name: string;
  readonly status: PipelineStatus;
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly durationMs: number | null;
}

export interface Job {
  readonly id: string;
  readonly name: string;
  readonly stage: string;
  readonly image: string;
  readonly status: JobStatus;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly allowFailure: boolean;
  readonly timeoutMs: number;
  readonly exitCode: number | null;
  readonly failureReason: string | null;
  readonly failureMessage: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly durationMs: number | null;
}

export interface JobEdge {
  readonly from: string;
  readonly to: string;
}

export interface PipelineDetail {
  readonly pipeline: Pipeline;
  readonly jobs: readonly Job[];
  readonly edges: readonly JobEdge[];
  readonly layers: readonly (readonly string[])[];
}

export interface LogLine {
  readonly seq: number;
  readonly attempt: number;
  readonly stream: 'stdout' | 'stderr';
  readonly message: string;
  readonly createdAt: number;
}

export interface Artifact {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly expired: boolean;
  readonly downloadUrl: string;
}

export interface Runner {
  readonly id: string;
  readonly name: string;
  readonly executor: string;
  readonly status: 'online' | 'offline';
  readonly concurrency: number;
  readonly registeredAt: number;
  readonly lastSeenAt: number;
  readonly activePipelines: number;
}

export interface ConfigIssue {
  readonly path: string;
  readonly message: string;
}
