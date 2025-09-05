import { parseDuration } from './duration.js';
import { ConfigError } from './errors.js';
import type { RawArtifacts, RawConfig, RawJob, RawRetry } from './schema.js';
import type {
  ArtifactDefinition,
  JobDefinition,
  PipelineDefinition,
  RetryPolicy,
  RetryTrigger,
} from './types.js';

export const DEFAULT_STAGES = ['build', 'test', 'deploy'] as const;
export const DEFAULT_IMAGE = 'alpine:3.20';
export const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
export const DEFAULT_ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const NO_RETRY: RetryPolicy = { max: 0, when: ['always'] };

function toArray<T>(value: T | readonly T[] | undefined, fallback: readonly T[]): readonly T[] {
  if (value === undefined) {
    return fallback;
  }
  return Array.isArray(value) ? value : [value as T];
}

function normalizeRetry(raw: RawRetry | undefined): RetryPolicy {
  if (raw === undefined) {
    return NO_RETRY;
  }
  if (typeof raw === 'number') {
    return { max: raw, when: ['always'] };
  }
  const when = toArray<RetryTrigger>(raw.when, ['always']);
  return { max: raw.max, when };
}

function normalizeArtifacts(
  jobName: string,
  raw: RawArtifacts | undefined,
): ArtifactDefinition | null {
  if (raw === undefined) {
    return null;
  }
  return {
    name: raw.name ?? jobName,
    paths: [...raw.paths],
    expireInMs: raw.expire_in === undefined ? DEFAULT_ARTIFACT_TTL_MS : parseDuration(raw.expire_in),
  };
}

function normalizeJob(
  name: string,
  raw: RawJob,
  stages: readonly string[],
  defaults: RawConfig['default'],
): JobDefinition {
  const stage = raw.stage ?? (stages.includes('test') ? 'test' : (stages[0] as string));

  if (!stages.includes(stage)) {
    throw ConfigError.of(`jobs.${name}.stage`, `unknown stage "${stage}"`);
  }

  const timeout = raw.timeout ?? defaults?.timeout;

  return {
    name,
    stage,
    image: raw.image ?? defaults?.image ?? DEFAULT_IMAGE,
    script: toArray(raw.script, []),
    needs: [...new Set(toArray(raw.needs, []))],
    artifacts: normalizeArtifacts(name, raw.artifacts),
    retry: normalizeRetry(raw.retry ?? defaults?.retry),
    timeoutMs: timeout === undefined ? DEFAULT_TIMEOUT_MS : parseDuration(timeout),
  };
}

export function normalizeConfig(raw: RawConfig): PipelineDefinition {
  const stages = raw.stages ?? [...DEFAULT_STAGES];
  const duplicateStage = stages.find((stage, index) => stages.indexOf(stage) !== index);
  if (duplicateStage !== undefined) {
    throw ConfigError.of('stages', `duplicate stage "${duplicateStage}"`);
  }

  const jobs = Object.entries(raw.jobs).map(([name, job]) =>
    normalizeJob(name, job, stages, raw.default),
  );

  if (jobs.length === 0) {
    throw ConfigError.of('jobs', 'at least one job is required');
  }

  return { stages, jobs };
}
