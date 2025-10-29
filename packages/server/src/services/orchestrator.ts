import {
  PipelineRun,
  loadPipeline,
  type JobExecutor,
  type PipelineStatus,
  type RunListener,
} from '@cicd/core';
import type { Logger } from '../logger.js';
import type { JobRepository } from '../repositories/jobs.js';
import type { LogRepository } from '../repositories/logs.js';
import type { PipelineRepository } from '../repositories/pipelines.js';

export interface OrchestratorDeps {
  readonly pipelines: PipelineRepository;
  readonly jobs: JobRepository;
  readonly logs: LogRepository;
  readonly logger: Logger;
  readonly executor: JobExecutor;
  readonly concurrency: number;
}

export class PipelineNotFoundError extends Error {
  constructor(readonly pipelineId: string) {
    super(`Pipeline ${pipelineId} not found`);
    this.name = 'PipelineNotFoundError';
  }
}

export class PipelineNotStartableError extends Error {
  constructor(
    readonly pipelineId: string,
    readonly status: PipelineStatus,
  ) {
    super(`Pipeline ${pipelineId} cannot be started while it is ${status}`);
    this.name = 'PipelineNotStartableError';
  }
}

export class Orchestrator {
  private readonly runs = new Map<string, PipelineRun>();
  private readonly pending = new Map<string, Promise<PipelineStatus>>();

  constructor(private readonly deps: OrchestratorDeps) {}

  isRunning(pipelineId: string): boolean {
    return this.runs.has(pipelineId);
  }

  get activeCount(): number {
    return this.runs.size;
  }

  start(pipelineId: string): Promise<PipelineStatus> {
    const pipeline = this.deps.pipelines.findById(pipelineId);
    if (pipeline === null) {
      throw new PipelineNotFoundError(pipelineId);
    }
    if (this.pending.has(pipelineId) || pipeline.status !== 'pending') {
      throw new PipelineNotStartableError(pipelineId, pipeline.status);
    }

    const { graph } = loadPipeline(pipeline.config);
    const run = new PipelineRun(graph, this.deps.executor, {
      pipelineId,
      concurrency: this.deps.concurrency,
      listener: this.createListener(pipelineId),
    });

    this.runs.set(pipelineId, run);

    const promise = run
      .start()
      .catch((error: unknown) => {
        this.deps.logger.error({ pipelineId, err: error }, 'pipeline run crashed');
        this.deps.pipelines.updateStatus(pipelineId, 'failed');
        return 'failed' as PipelineStatus;
      })
      .finally(() => {
        this.runs.delete(pipelineId);
        this.pending.delete(pipelineId);
      });

    this.pending.set(pipelineId, promise);
    return promise;
  }

  cancel(pipelineId: string): boolean {
    const run = this.runs.get(pipelineId);
    if (run === undefined) {
      return false;
    }
    run.cancel();
    return true;
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending.values()]);
  }

  private createListener(pipelineId: string): RunListener {
    const { jobs, pipelines, logs, logger } = this.deps;

    return {
      onJobLog: (name, attempt, line) => {
        const job = jobs.findByName(pipelineId, name);
        if (job !== null) {
          logs.append({ jobId: job.id, attempt, stream: line.stream, message: line.text });
        }
      },
      onJobStarted: (name, attempt) => {
        jobs.markStarted(pipelineId, name, attempt);
        logger.debug({ pipelineId, job: name, attempt }, 'job started');
      },
      onJobFinished: (name, attempt, outcome, status) => {
        jobs.markFinished(pipelineId, name, {
          status,
          exitCode: outcome.exitCode,
          failureReason: outcome.kind === 'failure' ? outcome.reason : null,
          failureMessage: outcome.kind === 'failure' ? (outcome.message ?? null) : null,
        });
        logger.debug({ pipelineId, job: name, attempt, status }, 'job finished');
      },
      onJobStatusChanged: (name, status) => {
        jobs.setStatus(pipelineId, name, status);
      },
      onStatusChanged: (status) => {
        pipelines.updateStatus(pipelineId, status);
        logger.info({ pipelineId, status }, 'pipeline status changed');
      },
    };
  }
}
