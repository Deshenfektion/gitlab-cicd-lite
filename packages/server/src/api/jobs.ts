import type { JobSnapshot } from '@cicd/core';
import { Router } from 'express';
import type { AppContext } from '../context.js';
import type { JobRecord } from '../repositories/types.js';
import { JobNotRetryableError, planJobRetry } from '../services/retry.js';
import { serializeArtifact } from './artifacts.js';
import { conflict, notFound } from './errors.js';
import { serializeJob } from './serializers.js';
import { openEventStream } from './stream.js';

export function requireJob(context: AppContext, id: string): JobRecord {
  const job = context.jobs.findById(id);
  if (job === null) {
    throw notFound(`job ${id} not found`);
  }
  return job;
}

export function createJobRouter(context: AppContext): Router {
  const router = Router();

  router.get('/:id', (request, response) => {
    const job = requireJob(context, request.params.id);
    response.json({ job: serializeJob(job) });
  });

  router.get('/:id/logs', (request, response) => {
    const job = requireJob(context, request.params.id);
    const after = Number.parseInt(String(request.query.after ?? '0'), 10) || 0;
    const lines = context.logs.listByJob(job.id, after);

    response.json({
      jobId: job.id,
      status: job.status,
      lines,
      nextCursor: lines.length === 0 ? after : (lines[lines.length - 1] as { seq: number }).seq,
    });
  });

  router.post('/:id/retry', (request, response) => {
    const job = requireJob(context, request.params.id);
    const pipeline = context.pipelines.findById(job.pipelineId);
    if (pipeline === null) {
      throw notFound(`pipeline ${job.pipelineId} not found`);
    }
    if (context.orchestrator.isRunning(pipeline.id)) {
      throw conflict(`pipeline ${pipeline.id} is still running`);
    }

    let state: readonly JobSnapshot[];
    try {
      state = planJobRetry(context, pipeline, job.name);
    } catch (error) {
      if (error instanceof JobNotRetryableError) {
        throw conflict(error.message);
      }
      throw error;
    }

    void context.orchestrator.start(pipeline.id, state);
    response.status(202).json({ job: serializeJob(requireJob(context, job.id)) });
  });

  router.get('/:id/artifacts', (request, response) => {
    const job = requireJob(context, request.params.id);
    response.json({ artifacts: context.artifacts.listByJob(job.id).map(serializeArtifact) });
  });

  router.get('/:id/logs/stream', (request, response) => {
    const job = requireJob(context, request.params.id);
    const after = Number.parseInt(String(request.query.after ?? '0'), 10) || 0;
    const stream = openEventStream(request, response);

    for (const line of context.logs.listByJob(job.id, after)) {
      stream.send('job.log', { jobId: job.id, ...line });
    }

    const unsubscribe = context.events.subscribe(job.pipelineId, (event) => {
      if (event.type === 'job.log' && event.jobId === job.id) {
        stream.send('job.log', event);
        return;
      }
      if (event.type === 'job.status' && event.jobId === job.id) {
        stream.send('job.status', event);
      }
    });

    stream.onClose(unsubscribe);
  });

  return router;
}
