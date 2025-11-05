import { descendants, loadPipeline, type JobSnapshot } from '@cicd/core';
import type { JobRepository } from '../repositories/jobs.js';
import type { PipelineRepository } from '../repositories/pipelines.js';
import type { PipelineRecord } from '../repositories/types.js';

export class NothingToRetryError extends Error {
  constructor(readonly pipelineId: string) {
    super(`Pipeline ${pipelineId} has no jobs to retry`);
    this.name = 'NothingToRetryError';
  }
}

export class JobNotRetryableError extends Error {
  constructor(readonly jobName: string) {
    super(`Job ${jobName} cannot be retried while it is running`);
    this.name = 'JobNotRetryableError';
  }
}

export interface RetryPlanner {
  readonly pipelines: PipelineRepository;
  readonly jobs: JobRepository;
}

function resetAndSnapshot(
  deps: RetryPlanner,
  pipeline: PipelineRecord,
  names: readonly string[],
): readonly JobSnapshot[] {
  deps.jobs.resetForRetry(pipeline.id, names);
  deps.pipelines.updateStatus(pipeline.id, 'pending');

  return deps.pipelines
    .jobsOf(pipeline.id)
    .map((job) => ({ name: job.name, status: job.status, attempt: job.attempt }));
}

export function planJobRetry(
  deps: RetryPlanner,
  pipeline: PipelineRecord,
  jobName: string,
): readonly JobSnapshot[] {
  const job = deps.jobs.findByName(pipeline.id, jobName);
  if (job === null) {
    throw new Error(`Job ${jobName} not found`);
  }
  if (job.status === 'running') {
    throw new JobNotRetryableError(jobName);
  }

  const { graph } = loadPipeline(pipeline.config);
  const affected = [jobName, ...descendants(graph, jobName)];

  return resetAndSnapshot(deps, pipeline, affected);
}

export function planPipelineRetry(
  deps: RetryPlanner,
  pipeline: PipelineRecord,
): readonly JobSnapshot[] {
  const unfinished = deps.pipelines
    .jobsOf(pipeline.id)
    .filter(
      (job) => job.status === 'failed' || job.status === 'canceled' || job.status === 'skipped',
    )
    .map((job) => job.name);

  if (unfinished.length === 0) {
    throw new NothingToRetryError(pipeline.id);
  }

  return resetAndSnapshot(deps, pipeline, unfinished);
}
