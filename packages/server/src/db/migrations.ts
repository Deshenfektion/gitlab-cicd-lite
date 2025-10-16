export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'pipelines_and_jobs',
    sql: `
      CREATE TABLE pipelines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER
      );

      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        stage TEXT NOT NULL,
        image TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 1,
        allow_failure INTEGER NOT NULL DEFAULT 0,
        timeout_ms INTEGER NOT NULL,
        exit_code INTEGER,
        failure_reason TEXT,
        failure_message TEXT,
        started_at INTEGER,
        finished_at INTEGER,
        UNIQUE (pipeline_id, name)
      );

      CREATE TABLE job_dependencies (
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        depends_on_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        PRIMARY KEY (job_id, depends_on_id)
      );

      CREATE INDEX idx_jobs_pipeline ON jobs(pipeline_id);
      CREATE INDEX idx_job_dependencies_depends_on ON job_dependencies(depends_on_id);
    `,
  },
];
