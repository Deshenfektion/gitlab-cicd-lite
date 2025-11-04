import { createApp } from './api/app.js';
import { loadConfig } from './config.js';
import { createContext } from './context.js';

const config = loadConfig();
const context = createContext(config);
const app = createApp(context);

context.artifactCleaner.start();

const server = app.listen(config.port, config.host, () => {
  context.logger.info({ port: config.port, host: config.host }, 'server listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    context.logger.info({ signal }, 'shutting down');
    server.close(() => {
      context.close();
      process.exit(0);
    });
  });
}
