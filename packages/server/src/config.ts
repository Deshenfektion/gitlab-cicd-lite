import { resolve } from 'node:path';
import { isExecutorKind, type ExecutorKind } from '@cicd/runner';

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly databasePath: string;
  readonly workspaceRoot: string;
  readonly artifactRoot: string;
  readonly executor: ExecutorKind;
  readonly concurrency: number;
  readonly logLevel: string;
}

function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readExecutor(value: string | undefined): ExecutorKind {
  if (value !== undefined && isExecutorKind(value)) {
    return value;
  }
  return 'docker';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = resolve(env.DATA_DIR ?? './data');

  return {
    port: readInt(env.PORT, 3000),
    host: env.HOST ?? '0.0.0.0',
    databasePath: env.DATABASE_PATH ?? resolve(dataDir, 'cicd.db'),
    workspaceRoot: env.WORKSPACE_ROOT ?? resolve(dataDir, 'workspaces'),
    artifactRoot: env.ARTIFACT_ROOT ?? resolve(dataDir, 'artifacts'),
    executor: readExecutor(env.EXECUTOR),
    concurrency: readInt(env.CONCURRENCY, 4),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
