import { describe, expect, it } from 'vitest';
import { loadPipeline } from '../config/load.js';
import type { JobStatus, PipelineStatus } from '../config/types.js';
import { success } from './outcome.js';
import { PipelineRun, type RunListener, type RunOptions } from './run.js';
import { FakeExecutor, deferred, scriptFailure } from './testing.js';

const noDelay = () => Promise.resolve();

const runOf = (yaml: string, executor: FakeExecutor, options: RunOptions = {}) =>
  new PipelineRun(loadPipeline(yaml).graph, executor, { delay: noDelay, ...options });

const linear = `
jobs:
  build:
    script: echo
  test:
    script: echo
    needs: [build]
  deploy:
    script: echo
    needs: [test]
`;

describe('PipelineRun', () => {
  it('runs every job in dependency order', async () => {
    const executor = new FakeExecutor();
    const run = runOf(linear, executor);

    await expect(run.start()).resolves.toBe('success');
    expect(executor.executions.map((execution) => execution.jobName)).toEqual([
      'build',
      'test',
      'deploy',
    ]);
  });

  it('reports lifecycle events to the listener', async () => {
    const events: string[] = [];
    const listener: RunListener = {
      onJobStarted: (name, attempt) => events.push(`start ${name}#${attempt}`),
      onJobFinished: (name, _attempt, _outcome, status) => events.push(`end ${name}:${status}`),
      onStatusChanged: (status: PipelineStatus) => events.push(`pipeline:${status}`),
    };

    await runOf('jobs:\n  only:\n    script: echo\n', new FakeExecutor(), { listener }).start();

    expect(events).toEqual([
      'pipeline:running',
      'start only#1',
      'end only:success',
      'pipeline:success',
    ]);
  });

  it('forwards log lines with the attempt they belong to', async () => {
    const lines: string[] = [];
    await runOf('jobs:\n  a:\n    script: echo\n', new FakeExecutor(), {
      listener: {
        onJobLog: (name, attempt, line) => lines.push(`${name}#${attempt} ${line.text}`),
      },
    }).start();

    expect(lines).toEqual(['a#1 running a']);
  });

  it('runs independent jobs concurrently up to the limit', async () => {
    const gate = deferred();
    let waiting = 0;
    const executor = new FakeExecutor({
      hold: async () => {
        waiting += 1;
        if (waiting === 3) {
          gate.resolve();
        }
        await gate.promise;
      },
    });

    const yaml = 'jobs:\n  a:\n    script: e\n  b:\n    script: e\n  c:\n    script: e\n';
    await runOf(yaml, executor, { concurrency: 3 }).start();

    expect(executor.peakConcurrency).toBe(3);
  });

  it('never exceeds the configured concurrency', async () => {
    const executor = new FakeExecutor({ hold: () => new Promise((r) => setTimeout(r, 5)) });
    const yaml = ['a', 'b', 'c', 'd', 'e'].map((name) => `  ${name}:\n    script: e\n`).join('');

    await runOf(`jobs:\n${yaml}`, executor, { concurrency: 2 }).start();

    expect(executor.peakConcurrency).toBe(2);
    expect(executor.executions).toHaveLength(5);
  });

  it('skips the downstream jobs of a failure and never executes them', async () => {
    const executor = new FakeExecutor({ results: { build: scriptFailure(2) } });
    const skipped: string[] = [];

    const status = await runOf(linear, executor, {
      listener: { onJobSkipped: (name) => skipped.push(name) },
    }).start();

    expect(status).toBe('failed');
    expect(skipped).toEqual(['test', 'deploy']);
    expect(executor.executions.map((execution) => execution.jobName)).toEqual(['build']);
  });

  it('retries a failing job and continues once it passes', async () => {
    const executor = new FakeExecutor({ results: { flaky: [scriptFailure(1), success()] } });
    const yaml = `
jobs:
  flaky:
    script: echo
    retry: 1
  after:
    script: echo
    needs: [flaky]
`;

    const statuses: JobStatus[] = [];
    const status = await runOf(yaml, executor, {
      listener: {
        onJobFinished: (_name, _attempt, _outcome, jobStatus) => statuses.push(jobStatus),
      },
    }).start();

    expect(status).toBe('success');
    expect(statuses).toEqual(['pending', 'success', 'success']);
    expect(executor.executions).toEqual([
      { jobName: 'flaky', attempt: 1, image: 'alpine:3.20' },
      { jobName: 'flaky', attempt: 2, image: 'alpine:3.20' },
      { jobName: 'after', attempt: 1, image: 'alpine:3.20' },
    ]);
  });

  it('turns a thrown executor error into a runner failure', async () => {
    const executor = new FakeExecutor({ results: { a: new Error('docker daemon unreachable') } });
    let message: string | undefined;

    const status = await runOf('jobs:\n  a:\n    script: echo\n', executor, {
      listener: {
        onJobFinished: (_name, _attempt, outcome) => {
          message = outcome.kind === 'failure' ? outcome.message : undefined;
        },
      },
    }).start();

    expect(status).toBe('failed');
    expect(message).toBe('docker daemon unreachable');
  });

  it('fails a job that outlives its timeout and aborts its signal', async () => {
    let aborted = false;
    const executor = new FakeExecutor({
      hold: (context) =>
        new Promise((resolve) => {
          context.signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        }),
    });

    let reason: string | undefined;
    const status = await runOf('jobs:\n  slow:\n    script: sleep\n    timeout: 20ms\n', executor, {
      listener: {
        onJobFinished: (_name, _attempt, outcome) => {
          reason = outcome.kind === 'failure' ? outcome.reason : undefined;
        },
      },
    }).start();

    expect(status).toBe('failed');
    expect(reason).toBe('timeout');
    expect(aborted).toBe(true);
  });

  it('retries a timeout when the policy allows it', async () => {
    let attempts = 0;
    const executor = new FakeExecutor({
      hold: (context) =>
        new Promise((resolve) => {
          attempts += 1;
          if (attempts > 1) {
            resolve();
            return;
          }
          context.signal.addEventListener('abort', () => resolve());
        }),
    });

    const status = await runOf(
      `
jobs:
  slow:
    script: sleep
    timeout: 20ms
    retry:
      max: 1
      when: [timeout]
`,
      executor,
    ).start();

    expect(status).toBe('success');
    expect(attempts).toBe(2);
  });

  it('cancels running jobs and leaves pending ones cancelled', async () => {
    const started = deferred();
    const executor = new FakeExecutor({
      hold: (context) =>
        new Promise((resolve) => {
          started.resolve();
          context.signal.addEventListener('abort', () => resolve());
        }),
    });

    const run = runOf(linear, executor);
    const finished = run.start();
    await started.promise;
    run.cancel();

    await expect(finished).resolves.toBe('canceled');
    expect(run.scheduler.statusOf('build')).toBe('canceled');
    expect(run.scheduler.statusOf('deploy')).toBe('canceled');
    expect(executor.executions).toHaveLength(1);
  });

  it('refuses to start twice', async () => {
    const run = runOf('jobs:\n  a:\n    script: echo\n', new FakeExecutor());
    await run.start();
    await expect(run.start()).rejects.toThrow(/already started/);
  });
});
