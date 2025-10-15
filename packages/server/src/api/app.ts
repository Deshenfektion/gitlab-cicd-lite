import cors from 'cors';
import express, { type Express } from 'express';
import { errorHandler } from './errors.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.text({ type: ['text/yaml', 'application/yaml'], limit: '256kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  app.use(errorHandler);

  return app;
}
