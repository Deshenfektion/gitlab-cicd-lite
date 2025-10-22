import type { JobExecutor } from '@cicd/core';
import { createExecutor } from '@cicd/runner';
import { loadConfig, type ServerConfig } from './config.js';
import { openDatabase, type Db } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { createLogger, type Logger } from './logger.js';
import { JobRepository } from './repositories/jobs.js';
import { PipelineRepository } from './repositories/pipelines.js';
import { Orchestrator } from './services/orchestrator.js';

export interface AppContext {
  readonly config: ServerConfig;
  readonly logger: Logger;
  readonly db: Db;
  readonly pipelines: PipelineRepository;
  readonly jobs: JobRepository;
  readonly orchestrator: Orchestrator;
  close(): void;
}

export function createContext(
  config: ServerConfig = loadConfig(),
  executor?: JobExecutor,
): AppContext {
  const logger = createLogger(config.logLevel);
  const db = openDatabase(config.databasePath);
  migrate(db);

  const pipelines = new PipelineRepository(db);
  const jobs = new JobRepository(db);

  const orchestrator = new Orchestrator({
    pipelines,
    jobs,
    logger,
    executor:
      executor ?? createExecutor({ kind: config.executor, workspaceRoot: config.workspaceRoot }),
    concurrency: config.concurrency,
  });

  return {
    config,
    logger,
    db,
    pipelines,
    jobs,
    orchestrator,
    close: () => db.close(),
  };
}
