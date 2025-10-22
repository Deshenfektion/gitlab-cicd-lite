import type { Express } from 'express';
import { loadConfig, type ServerConfig } from '../config.js';
import type { AppContext } from '../context.js';
import { openDatabase } from '../db/connection.js';
import { migrate } from '../db/migrate.js';
import { createLogger } from '../logger.js';
import { JobRepository } from '../repositories/jobs.js';
import { PipelineRepository } from '../repositories/pipelines.js';
import { createApp } from './app.js';

export interface TestHarness {
  readonly app: Express;
  readonly context: AppContext;
}

export function createTestContext(overrides: Partial<ServerConfig> = {}): AppContext {
  const config: ServerConfig = {
    ...loadConfig({}),
    databasePath: ':memory:',
    logLevel: 'silent',
    ...overrides,
  };

  const db = openDatabase(config.databasePath);
  migrate(db);

  return {
    config,
    logger: createLogger(config.logLevel),
    db,
    pipelines: new PipelineRepository(db),
    jobs: new JobRepository(db),
    close: () => db.close(),
  };
}

export function createTestHarness(overrides: Partial<ServerConfig> = {}): TestHarness {
  const context = createTestContext(overrides);
  return { app: createApp(context), context };
}
