import { randomUUID } from 'node:crypto';
import type { JobStatus, PipelineDefinition, PipelineStatus } from '@cicd/core';
import type { Db } from '../db/connection.js';
import type { JobEdge, JobRecord, PipelineRecord } from './types.js';

interface PipelineRow {
  id: string;
  name: string;
  status: string;
  config: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

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

interface EdgeRow {
  job_name: string;
  depends_on_name: string;
}

const toPipeline = (row: PipelineRow): PipelineRecord => ({
  id: row.id,
  name: row.name,
  status: row.status as PipelineStatus,
  config: row.config,
  createdAt: row.created_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

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
  failureReason: row.failure_reason as JobRecord['failureReason'],
  failureMessage: row.failure_message,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

export interface CreatePipelineInput {
  readonly name: string;
  readonly config: string;
  readonly definition: PipelineDefinition;
}

export class PipelineRepository {
  constructor(private readonly db: Db) {}

  create(input: CreatePipelineInput): PipelineRecord {
    const id = randomUUID();
    const now = Date.now();

    const insertPipeline = this.db.prepare(
      `INSERT INTO pipelines (id, name, status, config, created_at)
       VALUES (?, ?, 'pending', ?, ?)`,
    );

    const insertJob = this.db.prepare(
      `INSERT INTO jobs
         (id, pipeline_id, name, stage, image, status, attempt, max_attempts,
          allow_failure, timeout_ms)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    );

    const insertEdge = this.db.prepare(
      'INSERT INTO job_dependencies (job_id, depends_on_id) VALUES (?, ?)',
    );

    this.db.transaction(() => {
      insertPipeline.run(id, input.name, input.config, now);

      const jobIds = new Map<string, string>();
      for (const job of input.definition.jobs) {
        const jobId = randomUUID();
        jobIds.set(job.name, jobId);
        insertJob.run(
          jobId,
          id,
          job.name,
          job.stage,
          job.image,
          job.retry.max + 1,
          job.allowFailure ? 1 : 0,
          job.timeoutMs,
        );
      }

      for (const job of input.definition.jobs) {
        for (const need of job.needs) {
          insertEdge.run(jobIds.get(job.name) as string, jobIds.get(need) as string);
        }
      }
    })();

    return this.findById(id) as PipelineRecord;
  }

  findById(id: string): PipelineRecord | null {
    const row = this.db.prepare('SELECT * FROM pipelines WHERE id = ?').get(id) as
      | PipelineRow
      | undefined;
    return row === undefined ? null : toPipeline(row);
  }

  list(limit = 50): readonly PipelineRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM pipelines ORDER BY created_at DESC LIMIT ?')
      .all(limit) as PipelineRow[];
    return rows.map(toPipeline);
  }

  jobsOf(pipelineId: string): readonly JobRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM jobs WHERE pipeline_id = ? ORDER BY rowid')
      .all(pipelineId) as JobRow[];
    return rows.map(toJob);
  }

  edgesOf(pipelineId: string): readonly JobEdge[] {
    const rows = this.db
      .prepare(
        `SELECT upstream.name AS depends_on_name, downstream.name AS job_name
           FROM job_dependencies AS dependency
           JOIN jobs AS downstream ON downstream.id = dependency.job_id
           JOIN jobs AS upstream ON upstream.id = dependency.depends_on_id
          WHERE downstream.pipeline_id = ?
          ORDER BY upstream.name, downstream.name`,
      )
      .all(pipelineId) as EdgeRow[];

    return rows.map((row) => ({ from: row.depends_on_name, to: row.job_name }));
  }

  updateStatus(id: string, status: PipelineStatus): void {
    const now = Date.now();
    if (status === 'running') {
      this.db
        .prepare(
          `UPDATE pipelines SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?`,
        )
        .run(status, now, id);
      return;
    }

    const finished = status === 'success' || status === 'failed' || status === 'canceled';
    this.db
      .prepare('UPDATE pipelines SET status = ?, finished_at = ? WHERE id = ?')
      .run(status, finished ? now : null, id);
  }

  deleteById(id: string): boolean {
    return this.db.prepare('DELETE FROM pipelines WHERE id = ?').run(id).changes > 0;
  }
}
