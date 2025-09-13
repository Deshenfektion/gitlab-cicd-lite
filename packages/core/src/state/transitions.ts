import type { JobStatus } from '../config/types.js';

const ALLOWED: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  pending: ['running', 'skipped', 'canceled'],
  running: ['success', 'failed', 'canceled'],
  success: [],
  failed: ['pending'],
  canceled: ['pending'],
  skipped: ['pending'],
};

const TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'success',
  'failed',
  'canceled',
  'skipped',
]);

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: JobStatus,
    readonly to: JobStatus,
  ) {
    super(`Illegal job transition ${from} -> ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return (ALLOWED[from] as readonly JobStatus[]).includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export function nextStatuses(from: JobStatus): readonly JobStatus[] {
  return ALLOWED[from];
}
