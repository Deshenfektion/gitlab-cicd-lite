import type { Db } from './connection.js';
import { MIGRATIONS, type Migration } from './migrations.js';

interface AppliedRow {
  id: number;
}

export function currentVersion(db: Db): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const row = db.prepare('SELECT MAX(id) AS id FROM schema_migrations').get() as
    | AppliedRow
    | undefined;
  return row?.id ?? 0;
}

export function migrate(db: Db, migrations: readonly Migration[] = MIGRATIONS): number {
  const applied = currentVersion(db);
  const pending = migrations.filter((migration) => migration.id > applied);

  const record = db.prepare(
    'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)',
  );

  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.id, migration.name, Date.now());
    })();
  }

  return pending.length;
}
