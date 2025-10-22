import type { JobEdge, JobRecord, PipelineRecord } from '../repositories/types.js';

export interface PipelineDto {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly durationMs: number | null;
}

export interface JobDto {
  readonly id: string;
  readonly name: string;
  readonly stage: string;
  readonly image: string;
  readonly status: string;
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

const duration = (startedAt: number | null, finishedAt: number | null): number | null =>
  startedAt === null || finishedAt === null ? null : finishedAt - startedAt;

export function serializePipeline(record: PipelineRecord): PipelineDto {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: duration(record.startedAt, record.finishedAt),
  };
}

export function serializeJob(record: JobRecord): JobDto {
  return {
    id: record.id,
    name: record.name,
    stage: record.stage,
    image: record.image,
    status: record.status,
    attempt: record.attempt,
    maxAttempts: record.maxAttempts,
    allowFailure: record.allowFailure,
    timeoutMs: record.timeoutMs,
    exitCode: record.exitCode,
    failureReason: record.failureReason,
    failureMessage: record.failureMessage,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: duration(record.startedAt, record.finishedAt),
  };
}

export function serializeEdges(edges: readonly JobEdge[]): readonly JobEdge[] {
  return edges.map((edge) => ({ from: edge.from, to: edge.to }));
}
