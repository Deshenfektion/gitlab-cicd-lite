import { FakeExecutor, type JobExecutor } from '@cicd/core';
import type { Express } from 'express';
import { loadConfig, type ServerConfig } from '../config.js';
import { createContext, type AppContext } from '../context.js';
import { createApp } from './app.js';

export interface TestHarness {
  readonly app: Express;
  readonly context: AppContext;
}

export function createTestContext(
  overrides: Partial<ServerConfig> = {},
  executor: JobExecutor = new FakeExecutor(),
): AppContext {
  const config: ServerConfig = {
    ...loadConfig({}),
    databasePath: ':memory:',
    logLevel: 'silent',
    ...overrides,
  };

  return createContext(config, executor);
}

export function createTestHarness(
  overrides: Partial<ServerConfig> = {},
  executor?: JobExecutor,
): TestHarness {
  const context = createTestContext(overrides, executor);
  return { app: createApp(context), context };
}
