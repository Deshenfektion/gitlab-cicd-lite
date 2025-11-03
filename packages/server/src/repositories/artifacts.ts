import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection.js';

export interface ArtifactRecord {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly pipelineId: string;
  readonly name: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
  readonly expiresAt: number;
}

interface ArtifactRow {
  id: string;
  job_id: string;
  job_name: string;
  pipeline_id: string;
  name: string;
  path: string;
  size_bytes: number;
  created_at: number;
  expires_at: number;
}

export interface SaveArtifactInput {
  readonly jobId: string;
  readonly name: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly expiresAt: number;
}

const SELECT = `
  SELECT artifact.*, job.name AS job_name, job.pipeline_id AS pipeline_id
    FROM artifacts AS artifact
    JOIN jobs AS job ON job.id = artifact.job_id
`;

const toArtifact = (row: ArtifactRow): ArtifactRecord => ({
  id: row.id,
  jobId: row.job_id,
  jobName: row.job_name,
  pipelineId: row.pipeline_id,
  name: row.name,
  path: row.path,
  sizeBytes: row.size_bytes,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
});

export class ArtifactRepository {
  constructor(private readonly db: Db) {}

  save(input: SaveArtifactInput): ArtifactRecord {
    const id = randomUUID();

    this.db
      .prepare(
        `INSERT INTO artifacts (id, job_id, name, path, size_bytes, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(job_id, name) DO UPDATE SET
           path = excluded.path,
           size_bytes = excluded.size_bytes,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`,
      )
      .run(id, input.jobId, input.name, input.path, input.sizeBytes, Date.now(), input.expiresAt);

    return this.findByJobAndName(input.jobId, input.name) as ArtifactRecord;
  }

  findById(id: string): ArtifactRecord | null {
    const row = this.db.prepare(`${SELECT} WHERE artifact.id = ?`).get(id) as
      | ArtifactRow
      | undefined;
    return row === undefined ? null : toArtifact(row);
  }

  findByJobAndName(jobId: string, name: string): ArtifactRecord | null {
    const row = this.db
      .prepare(`${SELECT} WHERE artifact.job_id = ? AND artifact.name = ?`)
      .get(jobId, name) as ArtifactRow | undefined;
    return row === undefined ? null : toArtifact(row);
  }

  listByJob(jobId: string): readonly ArtifactRecord[] {
    const rows = this.db
      .prepare(`${SELECT} WHERE artifact.job_id = ? ORDER BY artifact.name`)
      .all(jobId) as ArtifactRow[];
    return rows.map(toArtifact);
  }

  listByPipeline(pipelineId: string): readonly ArtifactRecord[] {
    const rows = this.db
      .prepare(`${SELECT} WHERE job.pipeline_id = ? ORDER BY job.rowid, artifact.name`)
      .all(pipelineId) as ArtifactRow[];
    return rows.map(toArtifact);
  }

  listExpired(now = Date.now()): readonly ArtifactRecord[] {
    const rows = this.db
      .prepare(`${SELECT} WHERE artifact.expires_at <= ?`)
      .all(now) as ArtifactRow[];
    return rows.map(toArtifact);
  }

  deleteById(id: string): boolean {
    return this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(id).changes > 0;
  }
}
