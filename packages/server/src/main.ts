import { createApp } from './api/app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const app = createApp();

const server = app.listen(config.port, config.host, () => {
  logger.info({ port: config.port, host: config.host }, 'server listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
  });
}
