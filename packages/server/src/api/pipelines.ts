import { loadPipeline, topologicalLayers } from '@cicd/core';
import { Router, type Request } from 'express';
import type { AppContext } from '../context.js';
import { PipelineNotFoundError, PipelineNotStartableError } from '../services/orchestrator.js';
import { badRequest, conflict, notFound } from './errors.js';
import { serializeEdges, serializeJob, serializePipeline } from './serializers.js';

interface CreateBody {
  name?: unknown;
  config?: unknown;
}

function readCreateRequest(request: Request): { name: string; config: string } {
  if (typeof request.body === 'string') {
    return { name: readName(request.query.name), config: request.body };
  }

  const body = (request.body ?? {}) as CreateBody;
  if (typeof body.config !== 'string' || body.config.trim().length === 0) {
    throw badRequest('a "config" string is required');
  }

  return { name: readName(body.name), config: body.config };
}

function readName(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim().slice(0, 120);
  }
  return `pipeline-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`;
}

export function createPipelineRouter(context: AppContext): Router {
  const router = Router();

  router.post('/', (request, response) => {
    const { name, config } = readCreateRequest(request);
    const { definition } = loadPipeline(config);
    const pipeline = context.pipelines.create({ name, config, definition });

    context.logger.info(
      { pipelineId: pipeline.id, jobs: definition.jobs.length },
      'pipeline created',
    );
    response.status(201).json({ pipeline: serializePipeline(pipeline) });
  });

  router.get('/', (request, response) => {
    const limit = Math.min(Number.parseInt(String(request.query.limit ?? '50'), 10) || 50, 200);
    response.json({ pipelines: context.pipelines.list(limit).map(serializePipeline) });
  });

  router.get('/:id', (request, response) => {
    const pipeline = requirePipeline(context, request.params.id);

    const jobs = context.pipelines.jobsOf(pipeline.id);
    const edges = context.pipelines.edgesOf(pipeline.id);
    const { graph } = loadPipeline(pipeline.config);

    response.json({
      pipeline: serializePipeline(pipeline),
      jobs: jobs.map(serializeJob),
      edges: serializeEdges(edges),
      layers: topologicalLayers(graph),
    });
  });

  router.post('/:id/start', (request, response) => {
    const id = request.params.id;

    try {
      void context.orchestrator.start(id);
    } catch (error) {
      if (error instanceof PipelineNotFoundError) {
        throw notFound(`pipeline ${id} not found`);
      }
      if (error instanceof PipelineNotStartableError) {
        throw conflict(error.message);
      }
      throw error;
    }

    response.status(202).json({ pipeline: serializePipeline(requirePipeline(context, id)) });
  });

  router.post('/:id/cancel', (request, response) => {
    const pipeline = requirePipeline(context, request.params.id);

    if (!context.orchestrator.cancel(pipeline.id)) {
      throw conflict(`pipeline ${pipeline.id} is not running`);
    }

    response.json({ pipeline: serializePipeline(requirePipeline(context, pipeline.id)) });
  });

  return router;
}

function requirePipeline(context: AppContext, id: string) {
  const pipeline = context.pipelines.findById(id);
  if (pipeline === null) {
    throw notFound(`pipeline ${id} not found`);
  }
  return pipeline;
}
