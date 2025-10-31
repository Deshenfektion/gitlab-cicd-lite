import type { Db } from '../db/connection.js';

export type RunnerStatus = 'online' | 'offline';

export interface RunnerRecord {
  readonly id: string;
  readonly name: string;
  readonly executor: string;
  readonly status: RunnerStatus;
  readonly concurrency: number;
  readonly registeredAt: number;
  readonly lastSeenAt: number;
}

interface RunnerRow {
  id: string;
  name: string;
  executor: string;
  status: string;
  concurrency: number;
  registered_at: number;
  last_seen_at: number;
}

export interface RegisterRunnerInput {
  readonly id: string;
  readonly name: string;
  readonly executor: string;
  readonly concurrency: number;
}

const toRunner = (row: RunnerRow): RunnerRecord => ({
  id: row.id,
  name: row.name,
  executor: row.executor,
  status: row.status === 'online' ? 'online' : 'offline',
  concurrency: row.concurrency,
  registeredAt: row.registered_at,
  lastSeenAt: row.last_seen_at,
});

export class RunnerRepository {
  constructor(private readonly db: Db) {}

  register(input: RegisterRunnerInput): RunnerRecord {
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO runners (id, name, executor, status, concurrency, registered_at, last_seen_at)
         VALUES (?, ?, ?, 'online', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           executor = excluded.executor,
           status = 'online',
           concurrency = excluded.concurrency,
           last_seen_at = excluded.last_seen_at`,
      )
      .run(input.id, input.name, input.executor, input.concurrency, now, now);

    return this.findById(input.id) as RunnerRecord;
  }

  heartbeat(id: string): void {
    this.db
      .prepare("UPDATE runners SET last_seen_at = ?, status = 'online' WHERE id = ?")
      .run(Date.now(), id);
  }

  markOffline(id: string): void {
    this.db.prepare("UPDATE runners SET status = 'offline' WHERE id = ?").run(id);
  }

  findById(id: string): RunnerRecord | null {
    const row = this.db.prepare('SELECT * FROM runners WHERE id = ?').get(id) as
      | RunnerRow
      | undefined;
    return row === undefined ? null : toRunner(row);
  }

  list(): readonly RunnerRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM runners ORDER BY registered_at')
      .all() as RunnerRow[];
    return rows.map(toRunner);
  }
}
