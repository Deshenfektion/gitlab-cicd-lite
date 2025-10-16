import type { FailureReason, JobStatus, PipelineStatus } from '@cicd/core';

export interface PipelineRecord {
  readonly id: string;
  readonly name: string;
  readonly status: PipelineStatus;
  readonly config: string;
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
}

export interface JobRecord {
  readonly id: string;
  readonly pipelineId: string;
  readonly name: string;
  readonly stage: string;
  readonly image: string;
  readonly status: JobStatus;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly allowFailure: boolean;
  readonly timeoutMs: number;
  readonly exitCode: number | null;
  readonly failureReason: FailureReason | null;
  readonly failureMessage: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
}

export interface JobEdge {
  readonly from: string;
  readonly to: string;
}
