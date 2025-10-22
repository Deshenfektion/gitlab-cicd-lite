import { loadConfig, type ServerConfig } from './config.js';
import { openDatabase, type Db } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { createLogger, type Logger } from './logger.js';
import { JobRepository } from './repositories/jobs.js';
import { PipelineRepository } from './repositories/pipelines.js';

export interface AppContext {
  readonly config: ServerConfig;
  readonly logger: Logger;
  readonly db: Db;
  readonly pipelines: PipelineRepository;
  readonly jobs: JobRepository;
  close(): void;
}

export function createContext(config: ServerConfig = loadConfig()): AppContext {
  const logger = createLogger(config.logLevel);
  const db = openDatabase(config.databasePath);
  migrate(db);

  return {
    config,
    logger,
    db,
    pipelines: new PipelineRepository(db),
    jobs: new JobRepository(db),
    close: () => db.close(),
  };
}
