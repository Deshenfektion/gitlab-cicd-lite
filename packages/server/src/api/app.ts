import cors from 'cors';
import express, { type Express } from 'express';
import type { AppContext } from '../context.js';
import { errorHandler } from './errors.js';
import { createArtifactRouter } from './artifacts.js';
import { createJobRouter } from './jobs.js';
import { createPipelineRouter } from './pipelines.js';
import { createRunnerRouter } from './runners.js';

export function createApp(context: AppContext): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.text({ type: ['text/yaml', 'application/yaml'], limit: '256kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  app.use('/api/pipelines', createPipelineRouter(context));
  app.use('/api/jobs', createJobRouter(context));
  app.use('/api/runners', createRunnerRouter(context));
  app.use('/api/artifacts', createArtifactRouter(context));

  app.use(errorHandler);

  return app;
}
