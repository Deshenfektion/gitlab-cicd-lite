export const FAILURE_REASONS = ['script_failure', 'runner_failure', 'timeout'] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];

export interface SuccessOutcome {
  readonly kind: 'success';
  readonly exitCode: number;
}

export interface FailureOutcome {
  readonly kind: 'failure';
  readonly reason: FailureReason;
  readonly exitCode: number | null;
  readonly message?: string;
}

export type JobOutcome = SuccessOutcome | FailureOutcome;

export function success(exitCode = 0): SuccessOutcome {
  return { kind: 'success', exitCode };
}

export function failure(
  reason: FailureReason,
  exitCode: number | null = null,
  message?: string,
): FailureOutcome {
  return message === undefined
    ? { kind: 'failure', reason, exitCode }
    : { kind: 'failure', reason, exitCode, message };
}
