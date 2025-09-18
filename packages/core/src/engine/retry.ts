import type { RetryPolicy } from '../config/types.js';
import type { FailureReason } from './outcome.js';

export interface RetryDecision {
  readonly retry: boolean;
  readonly attemptsLeft: number;
}

export function shouldRetry(
  policy: RetryPolicy,
  reason: FailureReason,
  completedAttempts: number,
): RetryDecision {
  const attemptsLeft = Math.max(0, policy.max - completedAttempts + 1);
  const covered = policy.when.includes('always') || policy.when.includes(reason);
  return { retry: covered && attemptsLeft > 0, attemptsLeft };
}

export function backoffMs(completedAttempts: number, baseMs = 1_000, capMs = 30_000): number {
  const exponent = Math.max(0, completedAttempts - 1);
  return Math.min(capMs, baseMs * 2 ** exponent);
}
