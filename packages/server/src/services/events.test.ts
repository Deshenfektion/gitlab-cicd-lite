import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@cicd/server';

describe('EventBus lifecycle', () => {
  it('drops the topic once every subscriber has left', () => {
    const bus = new EventBus();
    const off1 = bus.subscribe('p1', () => {});
    const off2 = bus.subscribe('p1', () => {});
    expect(bus.subscriberCount('p1')).toBe(2);
    off1();
    off2();
    expect(bus.subscriberCount('p1')).toBe(0);
  });

  it('tolerates unsubscribing twice', () => {
    const bus = new EventBus();
    const off = bus.subscribe('p1', () => {});
    off();
    expect(() => off()).not.toThrow();
    expect(bus.subscriberCount('p1')).toBe(0);
  });

  it('does not break delivery when a listener unsubscribes mid publish', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const off1 = bus.subscribe('p1', () => {
      seen.push('first');
      off1();
    });
    bus.subscribe('p1', () => seen.push('second'));

    bus.publish({ type: 'pipeline.status', pipelineId: 'p1', status: 'running' });

    expect(seen).toEqual(['first', 'second']);
    expect(bus.subscriberCount('p1')).toBe(1);
  });
});

describe('sse subscriber cleanup', () => {
  it('unsubscribes when the http client disconnects', { timeout: 15_000 }, async () => {
    const { createTestHarness } = await import('../api/testing.js');
    const { loadPipeline } = await import('@cicd/core');
    const http = await import('node:http');

    const harness = createTestHarness();
    const config = 'jobs:\n  a:\n    script: echo\n';
    const pipeline = harness.context.pipelines.create({
      name: 'sse',
      config,
      definition: loadPipeline(config).definition,
    });

    const server = http.createServer(harness.app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}/api/pipelines/${pipeline.id}/events`, {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(harness.context.events.subscriberCount(pipeline.id)).toBe(1), {
      timeout: 5000,
    });

    controller.abort();
    await vi.waitFor(() => expect(harness.context.events.subscriberCount(pipeline.id)).toBe(0), {
      timeout: 8000,
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
    harness.context.close();
  });
});
