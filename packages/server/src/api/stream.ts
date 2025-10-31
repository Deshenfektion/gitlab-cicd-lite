import type { Request, Response } from 'express';

const HEARTBEAT_MS = 25_000;

export interface EventStream {
  send(event: string, payload: unknown): void;
  close(): void;
  onClose(handler: () => void): void;
}

export function openEventStream(request: Request, response: Response): EventStream {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();

  const heartbeat = setInterval(() => {
    response.write(': ping\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref();

  let closed = false;
  const handlers: Array<() => void> = [];

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(heartbeat);
    for (const handler of handlers) {
      handler();
    }
    response.end();
  };

  request.on('close', close);

  return {
    send: (event, payload) => {
      if (closed) {
        return;
      }
      response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    },
    close,
    onClose: (handler) => {
      handlers.push(handler);
    },
  };
}
