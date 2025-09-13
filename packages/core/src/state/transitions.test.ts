import { describe, expect, it } from 'vitest';
import { JOB_STATUSES, type JobStatus } from '../config/types.js';
import {
  IllegalTransitionError,
  assertTransition,
  canTransition,
  isTerminal,
  nextStatuses,
} from './transitions.js';

const LEGAL: ReadonlyArray<readonly [JobStatus, JobStatus]> = [
  ['pending', 'running'],
  ['pending', 'skipped'],
  ['pending', 'canceled'],
  ['running', 'success'],
  ['running', 'failed'],
  ['running', 'canceled'],
  ['failed', 'pending'],
  ['canceled', 'pending'],
  ['skipped', 'pending'],
];

describe('job transitions', () => {
  it('allows exactly the documented transitions', () => {
    const legal = new Set(LEGAL.map(([from, to]) => `${from}->${to}`));
    for (const from of JOB_STATUSES) {
      for (const to of JOB_STATUSES) {
        expect(canTransition(from, to)).toBe(legal.has(`${from}->${to}`));
      }
    }
  });

  it('never allows a job to stay in the same status', () => {
    for (const status of JOB_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('rejects skipping straight from pending to success', () => {
    expect(() => assertTransition('pending', 'success')).toThrow(IllegalTransitionError);
  });

  it('rejects resurrecting a successful job', () => {
    expect(nextStatuses('success')).toEqual([]);
    expect(() => assertTransition('success', 'running')).toThrow(IllegalTransitionError);
  });

  it('allows a skipped job to become pending again when an upstream retry succeeds', () => {
    expect(() => assertTransition('skipped', 'pending')).not.toThrow();
  });

  it('treats every finished status as terminal', () => {
    expect(isTerminal('success')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('canceled')).toBe(true);
    expect(isTerminal('skipped')).toBe(true);
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('running')).toBe(false);
  });

  it('reports both endpoints in the error message', () => {
    try {
      assertTransition('success', 'failed');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as IllegalTransitionError).from).toBe('success');
      expect((error as IllegalTransitionError).to).toBe('failed');
      expect((error as Error).message).toBe('Illegal job transition success -> failed');
    }
  });
});
