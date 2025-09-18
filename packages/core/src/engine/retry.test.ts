import { describe, expect, it } from 'vitest';
import type { RetryPolicy } from '../config/types.js';
import { backoffMs, shouldRetry } from './retry.js';

const policy = (max: number, when: RetryPolicy['when'] = ['always']): RetryPolicy => ({ max, when });

describe('shouldRetry', () => {
  it('never retries when max is zero', () => {
    expect(shouldRetry(policy(0), 'script_failure', 1)).toEqual({ retry: false, attemptsLeft: 0 });
  });

  it('allows exactly max retries after the first attempt', () => {
    const twice = policy(2);
    expect(shouldRetry(twice, 'script_failure', 1).retry).toBe(true);
    expect(shouldRetry(twice, 'script_failure', 2).retry).toBe(true);
    expect(shouldRetry(twice, 'script_failure', 3).retry).toBe(false);
  });

  it('counts down the remaining attempts', () => {
    expect(shouldRetry(policy(3), 'timeout', 1).attemptsLeft).toBe(3);
    expect(shouldRetry(policy(3), 'timeout', 3).attemptsLeft).toBe(1);
    expect(shouldRetry(policy(3), 'timeout', 4).attemptsLeft).toBe(0);
  });

  it('only retries the configured failure kinds', () => {
    const infraOnly = policy(2, ['runner_failure', 'timeout']);
    expect(shouldRetry(infraOnly, 'runner_failure', 1).retry).toBe(true);
    expect(shouldRetry(infraOnly, 'timeout', 1).retry).toBe(true);
    expect(shouldRetry(infraOnly, 'script_failure', 1).retry).toBe(false);
  });

  it('treats always as covering every failure kind', () => {
    for (const reason of ['script_failure', 'runner_failure', 'timeout'] as const) {
      expect(shouldRetry(policy(1, ['always']), reason, 1).retry).toBe(true);
    }
  });
});

describe('backoffMs', () => {
  it('doubles the delay after each attempt', () => {
    expect(backoffMs(1)).toBe(1_000);
    expect(backoffMs(2)).toBe(2_000);
    expect(backoffMs(3)).toBe(4_000);
  });

  it('is capped', () => {
    expect(backoffMs(20)).toBe(30_000);
  });
});
