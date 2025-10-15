import { pino, stdTimeFunctions, type Logger } from 'pino';

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: undefined,
    timestamp: stdTimeFunctions.isoTime,
  });
}

export type { Logger };
