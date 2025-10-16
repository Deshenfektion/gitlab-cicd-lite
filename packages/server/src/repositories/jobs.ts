import type { FailureReason, JobStatus } from '@cicd/core';
import type { Db } from '../db/connection.js';
import type { JobRecord } from './types.js';

interface JobRow {
  id: string;
  pipeline_id: string;
  name: string;
  stage: string;
  image: string;
  status: string;
  attempt: number;
  max_attempts: number;
  allow_failure: number;
  timeout_ms: number;
  exit_code: number | null;
  failure_reason: string | null;
  failure_message: string | null;
  started_at: number | null;
  finished_at: number | null;
}

const toJob = (row: JobRow): JobRecord => ({
  id: row.id,
  pipelineId: row.pipeline_id,
  name: row.name,
  stage: row.stage,
  image: row.image,
  status: row.status as JobStatus,
  attempt: row.attempt,
  maxAttempts: row.max_attempts,
  allowFailure: row.allow_failure === 1,
  timeoutMs: row.timeout_ms,
  exitCode: row.exit_code,
  failureReason: row.failure_reason as FailureReason | null,
  failureMessage: row.failure_message,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

export interface JobFinishInput {
  readonly status: JobStatus;
  readonly exitCode?: number | null;
  readonly failureReason?: FailureReason | null;
  readonly failureMessage?: string | null;
}

export class JobRepository {
  constructor(private readonly db: Db) {}

  findById(id: string): JobRecord | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
    return row === undefined ? null : toJob(row);
  }

  findByName(pipelineId: string, name: string): JobRecord | null {
    const row = this.db
      .prepare('SELECT * FROM jobs WHERE pipeline_id = ? AND name = ?')
      .get(pipelineId, name) as JobRow | undefined;
    return row === undefined ? null : toJob(row);
  }

  markStarted(pipelineId: string, name: string, attempt: number): void {
    this.db
      .prepare(
        `UPDATE jobs
            SET status = 'running', attempt = ?, started_at = ?, finished_at = NULL,
                exit_code = NULL, failure_reason = NULL, failure_message = NULL
          WHERE pipeline_id = ? AND name = ?`,
      )
      .run(attempt, Date.now(), pipelineId, name);
  }

  markFinished(pipelineId: string, name: string, input: JobFinishInput): void {
    const terminal =
      input.status === 'success' ||
      input.status === 'failed' ||
      input.status === 'canceled' ||
      input.status === 'skipped';

    this.db
      .prepare(
        `UPDATE jobs
            SET status = ?, exit_code = ?, failure_reason = ?, failure_message = ?,
                finished_at = ?
          WHERE pipeline_id = ? AND name = ?`,
      )
      .run(
        input.status,
        input.exitCode ?? null,
        input.failureReason ?? null,
        input.failureMessage ?? null,
        terminal ? Date.now() : null,
        pipelineId,
        name,
      );
  }

  setStatus(pipelineId: string, name: string, status: JobStatus): void {
    this.db
      .prepare('UPDATE jobs SET status = ? WHERE pipeline_id = ? AND name = ?')
      .run(status, pipelineId, name);
  }

  resetForRetry(pipelineId: string, names: readonly string[]): void {
    if (names.length === 0) {
      return;
    }

    const placeholders = names.map(() => '?').join(', ');
    this.db
      .prepare(
        `UPDATE jobs
            SET status = 'pending', attempt = 0, started_at = NULL, finished_at = NULL,
                exit_code = NULL, failure_reason = NULL, failure_message = NULL
          WHERE pipeline_id = ? AND name IN (${placeholders})`,
      )
      .run(pipelineId, ...names);
  }
}
