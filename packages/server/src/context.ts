import type { JobExecutor } from '@cicd/core';
import { FilesystemArtifactStore, createExecutor } from '@cicd/runner';
import { loadConfig, type ServerConfig } from './config.js';
import { openDatabase, type Db } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { createLogger, type Logger } from './logger.js';
import { ArtifactRepository } from './repositories/artifacts.js';
import { JobRepository } from './repositories/jobs.js';
import { LogRepository } from './repositories/logs.js';
import { PipelineRepository } from './repositories/pipelines.js';
import { RunnerRepository } from './repositories/runners.js';
import { ArtifactCleaner } from './services/artifact-cleaner.js';
import { EventBus } from './services/events.js';
import { Orchestrator } from './services/orchestrator.js';

export interface AppContext {
  readonly config: ServerConfig;
  readonly logger: Logger;
  readonly db: Db;
  readonly pipelines: PipelineRepository;
  readonly jobs: JobRepository;
  readonly logs: LogRepository;
  readonly artifacts: ArtifactRepository;
  readonly runners: RunnerRepository;
  readonly events: EventBus;
  readonly orchestrator: Orchestrator;
  readonly artifactCleaner: ArtifactCleaner;
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
  const logs = new LogRepository(db);
  const artifacts = new ArtifactRepository(db);
  const runners = new RunnerRepository(db);
  const events = new EventBus();

  const executorId =
    executor ??
    createExecutor({
      kind: config.executor,
      workspaceRoot: config.workspaceRoot,
      artifactRoot: config.artifactRoot,
      ...(config.dockerSocket === undefined ? {} : { dockerSocket: config.dockerSocket }),
    });

  runners.register({
    id: 'local',
    name: 'local runner',
    executor: executorId.id,
    concurrency: config.concurrency,
  });

  const orchestrator = new Orchestrator({
    pipelines,
    jobs,
    logs,
    artifacts,
    logger,
    events,
    executor: executorId,
    concurrency: config.concurrency,
  });

  const artifactCleaner = new ArtifactCleaner({
    artifacts,
    store: new FilesystemArtifactStore(config.artifactRoot),
    logger,
  });

  return {
    config,
    logger,
    db,
    pipelines,
    jobs,
    logs,
    artifacts,
    runners,
    events,
    orchestrator,
    artifactCleaner,
    close: () => {
      artifactCleaner.stop();
      db.close();
    },
  };
}
