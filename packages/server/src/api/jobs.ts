import { Router } from 'express';
import type { AppContext } from '../context.js';
import type { JobRecord } from '../repositories/types.js';
import { notFound } from './errors.js';
import { serializeJob } from './serializers.js';

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

  return router;
}
