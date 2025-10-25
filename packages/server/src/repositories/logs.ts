import type { Db } from '../db/connection.js';

export interface LogLineRecord {
  readonly seq: number;
  readonly attempt: number;
  readonly stream: 'stdout' | 'stderr';
  readonly message: string;
  readonly createdAt: number;
}

interface LogRow {
  seq: number;
  attempt: number;
  stream: string;
  message: string;
  created_at: number;
}

export interface AppendLogInput {
  readonly jobId: string;
  readonly attempt: number;
  readonly stream: 'stdout' | 'stderr';
  readonly message: string;
}

const toLine = (row: LogRow): LogLineRecord => ({
  seq: row.seq,
  attempt: row.attempt,
  stream: row.stream === 'stderr' ? 'stderr' : 'stdout',
  message: row.message,
  createdAt: row.created_at,
});

export class LogRepository {
  constructor(private readonly db: Db) {}

  append(input: AppendLogInput): LogLineRecord {
    const result = this.db
      .prepare(
        `INSERT INTO job_logs (job_id, attempt, stream, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.jobId, input.attempt, input.stream, input.message, Date.now());

    return {
      seq: Number(result.lastInsertRowid),
      attempt: input.attempt,
      stream: input.stream,
      message: input.message,
      createdAt: Date.now(),
    };
  }

  appendMany(inputs: readonly AppendLogInput[]): void {
    if (inputs.length === 0) {
      return;
    }

    const statement = this.db.prepare(
      `INSERT INTO job_logs (job_id, attempt, stream, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    this.db.transaction(() => {
      const now = Date.now();
      for (const input of inputs) {
        statement.run(input.jobId, input.attempt, input.stream, input.message, now);
      }
    })();
  }

  listByJob(jobId: string, afterSeq = 0, limit = 5_000): readonly LogLineRecord[] {
    const rows = this.db
      .prepare(
        `SELECT seq, attempt, stream, message, created_at
           FROM job_logs
          WHERE job_id = ? AND seq > ?
          ORDER BY seq
          LIMIT ?`,
      )
      .all(jobId, afterSeq, limit) as LogRow[];

    return rows.map(toLine);
  }

  deleteByJob(jobId: string): number {
    return this.db.prepare('DELETE FROM job_logs WHERE job_id = ?').run(jobId).changes;
  }
}
