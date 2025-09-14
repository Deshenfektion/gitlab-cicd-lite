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
    expect(scheduler.complete('build', success())).toBe(false);
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
