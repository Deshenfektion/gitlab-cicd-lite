import { Router } from 'express';
import type { AppContext } from '../context.js';
import { notFound } from './errors.js';

export function createRunnerRouter(context: AppContext): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json({
      runners: context.runners.list().map((runner) => ({
        ...runner,
        activePipelines: context.orchestrator.activeCount,
      })),
    });
  });

  router.get('/:id', (request, response) => {
    const runner = context.runners.findById(request.params.id);
    if (runner === null) {
      throw notFound(`runner ${request.params.id} not found`);
    }

    response.json({ runner: { ...runner, activePipelines: context.orchestrator.activeCount } });
  });

  return router;
}
