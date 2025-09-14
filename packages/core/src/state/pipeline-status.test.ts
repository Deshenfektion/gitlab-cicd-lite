import { describe, expect, it } from 'vitest';
import { derivePipelineStatus, isPipelineFinished } from './pipeline-status.js';

describe('derivePipelineStatus', () => {
  it('is pending while no job has started', () => {
    expect(derivePipelineStatus(['pending', 'pending'])).toBe('pending');
  });

  it('is running as soon as one job runs', () => {
    expect(derivePipelineStatus(['running', 'pending'])).toBe('running');
  });

  it('stays running while jobs are still queued behind finished ones', () => {
    expect(derivePipelineStatus(['success', 'pending'])).toBe('running');
    expect(derivePipelineStatus(['failed', 'pending'])).toBe('running');
  });

  it('succeeds when every job succeeded', () => {
    expect(derivePipelineStatus(['success', 'success'])).toBe('success');
  });

  it('treats skipped jobs as an acceptable outcome', () => {
    expect(derivePipelineStatus(['success', 'skipped'])).toBe('success');
  });

  it('fails when any job failed, even alongside cancellations', () => {
    expect(derivePipelineStatus(['success', 'failed'])).toBe('failed');
    expect(derivePipelineStatus(['failed', 'canceled', 'skipped'])).toBe('failed');
  });

  it('is canceled when jobs were cancelled but none failed', () => {
    expect(derivePipelineStatus(['success', 'canceled'])).toBe('canceled');
    expect(derivePipelineStatus(['canceled', 'skipped'])).toBe('canceled');
  });

  it('succeeds for a pipeline without jobs', () => {
    expect(derivePipelineStatus([])).toBe('success');
  });
});

describe('isPipelineFinished', () => {
  it('only reports terminal pipeline statuses', () => {
    expect(isPipelineFinished('success')).toBe(true);
    expect(isPipelineFinished('failed')).toBe(true);
    expect(isPipelineFinished('canceled')).toBe(true);
    expect(isPipelineFinished('pending')).toBe(false);
    expect(isPipelineFinished('running')).toBe(false);
  });
});
