import { describe, expect, it } from 'vitest';
import { loadPipeline } from '../config/load.js';
import { failure, success } from './outcome.js';
import { PipelineScheduler } from './scheduler.js';

const schedulerFor = (yaml: string) => new PipelineScheduler(loadPipeline(yaml).graph);

const diamond = `
jobs:
  build:
    script: echo
  lint:
    script: echo
    needs: [build]
  unit:
    script: echo
    needs: [build]
  deploy:
    script: echo
    needs: [lint, unit]
`;

describe('PipelineScheduler', () => {
  it('starts as a pending pipeline with only root jobs ready', () => {
    const scheduler = schedulerFor(diamond);
    expect(scheduler.status).toBe('pending');
    expect(scheduler.ready()).toEqual(['build']);
    expect(scheduler.finished).toBe(false);
  });

  it('releases independent jobs together once their dependency succeeds', () => {
    const scheduler = schedulerFor(diamond);
    scheduler.start('build');
    expect(scheduler.status).toBe('running');
    expect(scheduler.ready()).toEqual([]);

    scheduler.complete('build', success());
    expect(scheduler.ready()).toEqual(['lint', 'unit']);
  });

  it('holds a join job until every dependency has succeeded', () => {
    const scheduler = schedulerFor(diamond);
    scheduler.start('build');
    scheduler.complete('build', success());

    scheduler.start('lint');
    scheduler.complete('lint', success());
    expect(scheduler.ready()).toEqual(['unit']);

    scheduler.start('unit');
    scheduler.complete('unit', success());
    expect(scheduler.ready()).toEqual(['deploy']);
  });

  it('reaches success when every job succeeded', () => {
    const scheduler = schedulerFor(diamond);
    for (const name of ['build', 'lint', 'unit', 'deploy']) {
      scheduler.start(name);
      scheduler.complete(name, success());
    }
    expect(scheduler.status).toBe('success');
    expect(scheduler.finished).toBe(true);
  });

  it('counts attempts per job', () => {
    const scheduler = schedulerFor(diamond);
    expect(scheduler.attemptOf('build')).toBe(0);
    expect(scheduler.start('build')).toBe(1);
    expect(scheduler.attemptOf('build')).toBe(1);
  });

  it('exposes the job definition behind a name', () => {
    const scheduler = schedulerFor('jobs:\n  a:\n    image: node:22-alpine\n    script: echo hi\n');
    expect(scheduler.definitionOf('a').image).toBe('node:22-alpine');
    expect(scheduler.definitionOf('a').script).toEqual(['echo hi']);
  });

  it('runs fully independent jobs in one batch', () => {
    const scheduler = schedulerFor('jobs:\n  a:\n    script: echo\n  b:\n    script: echo\n');
    expect(scheduler.ready()).toEqual(['a', 'b']);
  });

  it('ignores an outcome for a job that is not running', () => {
    const scheduler = schedulerFor(diamond);
    expect(scheduler.complete('build', success()).accepted).toBe(false);
    expect(scheduler.statusOf('build')).toBe('pending');
  });

  it('rejects starting a job whose dependencies are unfinished', () => {
    const scheduler = schedulerFor(diamond);
    scheduler.start('build');
    expect(() => scheduler.start('build')).toThrow(/Illegal job transition/);
  });

  it('skips the downstream closure of a failed job', () => {
    const scheduler = schedulerFor(diamond);
    scheduler.start('build');
    scheduler.complete('build', failure('script_failure', 1));

    expect(scheduler.statusOf('build')).toBe('failed');
    expect(scheduler.statusOf('lint')).toBe('skipped');
    expect(scheduler.statusOf('unit')).toBe('skipped');
    expect(scheduler.statusOf('deploy')).toBe('skipped');
    expect(scheduler.status).toBe('failed');
    expect(scheduler.ready()).toEqual([]);
  });

  it('only skips the branch below the failure', () => {
    const scheduler = schedulerFor(diamond);
    scheduler.start('build');
    scheduler.complete('build', success());
    scheduler.start('lint');
    scheduler.start('unit');
    scheduler.complete('lint', failure('script_failure', 2));

    expect(scheduler.statusOf('deploy')).toBe('skipped');
    expect(scheduler.statusOf('unit')).toBe('running');
    expect(scheduler.status).toBe('running');

    scheduler.complete('unit', success());
    expect(scheduler.status).toBe('failed');
  });

  it('cancels pending and running jobs and reports what was interrupted', () => {
    const scheduler = schedulerFor(diamond);
    scheduler.start('build');
    scheduler.complete('build', success());
    scheduler.start('lint');

    expect(scheduler.cancel()).toEqual(['lint']);
    expect(scheduler.statusOf('build')).toBe('success');
    expect(scheduler.statusOf('lint')).toBe('canceled');
    expect(scheduler.statusOf('unit')).toBe('canceled');
    expect(scheduler.status).toBe('canceled');
    expect(scheduler.finished).toBe(true);
  });

  it('reports a stable snapshot in topological order', () => {
    const scheduler = schedulerFor(diamond);
    scheduler.start('build');
    expect(scheduler.snapshot()).toEqual([
      { name: 'build', status: 'running', attempt: 1 },
      { name: 'lint', status: 'pending', attempt: 0 },
      { name: 'unit', status: 'pending', attempt: 0 },
      { name: 'deploy', status: 'pending', attempt: 0 },
    ]);
  });
});

describe('PipelineScheduler retries', () => {
  const retrying = (max: number, when = '[always]') => `
jobs:
  flaky:
    script: echo
    retry:
      max: ${max}
      when: ${when}
  after:
    script: echo
    needs: [flaky]
`;

  it('puts a retryable job back into the ready set', () => {
    const scheduler = schedulerFor(retrying(1));
    scheduler.start('flaky');
    const result = scheduler.complete('flaky', failure('script_failure', 1));

    expect(result.retryScheduled).toBe(true);
    expect(result.retryDelayMs).toBe(1_000);
    expect(scheduler.statusOf('flaky')).toBe('pending');
    expect(scheduler.statusOf('after')).toBe('pending');
    expect(scheduler.ready()).toEqual(['flaky']);
  });

  it('increments the attempt counter on every retry', () => {
    const scheduler = schedulerFor(retrying(2));
    expect(scheduler.start('flaky')).toBe(1);
    scheduler.complete('flaky', failure('script_failure', 1));
    expect(scheduler.start('flaky')).toBe(2);
    scheduler.complete('flaky', failure('script_failure', 1));
    expect(scheduler.start('flaky')).toBe(3);
  });

  it('gives up once the retry budget is exhausted', () => {
    const scheduler = schedulerFor(retrying(1));
    scheduler.start('flaky');
    scheduler.complete('flaky', failure('script_failure', 1));
    scheduler.start('flaky');
    const result = scheduler.complete('flaky', failure('script_failure', 1));

    expect(result.retryScheduled).toBe(false);
    expect(scheduler.statusOf('flaky')).toBe('failed');
    expect(scheduler.statusOf('after')).toBe('skipped');
    expect(scheduler.status).toBe('failed');
  });

  it('lets a retried job succeed and unblock the pipeline', () => {
    const scheduler = schedulerFor(retrying(1));
    scheduler.start('flaky');
    scheduler.complete('flaky', failure('runner_failure'));
    scheduler.start('flaky');
    scheduler.complete('flaky', success());

    expect(scheduler.statusOf('flaky')).toBe('success');
    expect(scheduler.ready()).toEqual(['after']);
  });

  it('does not retry a failure kind outside the policy', () => {
    const scheduler = schedulerFor(retrying(3, '[timeout]'));
    scheduler.start('flaky');
    const result = scheduler.complete('flaky', failure('script_failure', 7));

    expect(result.retryScheduled).toBe(false);
    expect(scheduler.statusOf('flaky')).toBe('failed');
  });

  it('backs off exponentially between attempts', () => {
    const scheduler = schedulerFor(retrying(3));
    scheduler.start('flaky');
    expect(scheduler.complete('flaky', failure('timeout')).retryDelayMs).toBe(1_000);
    scheduler.start('flaky');
    expect(scheduler.complete('flaky', failure('timeout')).retryDelayMs).toBe(2_000);
    scheduler.start('flaky');
    expect(scheduler.complete('flaky', failure('timeout')).retryDelayMs).toBe(4_000);
  });
});

describe('PipelineScheduler allow_failure', () => {
  const tolerant = `
jobs:
  lint:
    script: echo
    allow_failure: true
  build:
    script: echo
  deploy:
    script: echo
    needs: [lint, build]
`;

  it('does not skip jobs behind a tolerated failure', () => {
    const scheduler = schedulerFor(tolerant);
    scheduler.start('lint');
    scheduler.complete('lint', failure('script_failure', 1));
    scheduler.start('build');
    scheduler.complete('build', success());

    expect(scheduler.statusOf('lint')).toBe('failed');
    expect(scheduler.statusOf('deploy')).toBe('pending');
    expect(scheduler.ready()).toEqual(['deploy']);
  });

  it('keeps the pipeline green when only tolerated jobs failed', () => {
    const scheduler = schedulerFor(tolerant);
    for (const [name, outcome] of [
      ['lint', failure('script_failure', 1)],
      ['build', success()],
      ['deploy', success()],
    ] as const) {
      scheduler.start(name);
      scheduler.complete(name, outcome);
    }
    expect(scheduler.status).toBe('success');
  });

  it('still fails the pipeline for an intolerant job', () => {
    const scheduler = schedulerFor(tolerant);
    scheduler.start('build');
    scheduler.complete('build', failure('script_failure', 1));
    expect(scheduler.statusOf('deploy')).toBe('skipped');
    expect(scheduler.status).toBe('running');

    scheduler.start('lint');
    scheduler.complete('lint', success());
    expect(scheduler.status).toBe('failed');
  });

  it('exhausts retries before tolerating the failure', () => {
    const scheduler = schedulerFor(`
jobs:
  flaky:
    script: echo
    allow_failure: true
    retry: 1
`);
    scheduler.start('flaky');
    expect(scheduler.complete('flaky', failure('timeout')).retryScheduled).toBe(true);
    scheduler.start('flaky');
    expect(scheduler.complete('flaky', failure('timeout')).retryScheduled).toBe(false);
    expect(scheduler.status).toBe('success');
  });
});
