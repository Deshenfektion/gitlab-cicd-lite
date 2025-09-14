import type { JobStatus, PipelineStatus } from '../config/types.js';
import { isTerminal } from './transitions.js';

export function derivePipelineStatus(statuses: readonly JobStatus[]): PipelineStatus {
  if (statuses.length === 0) {
    return 'success';
  }

  if (statuses.every((status) => status === 'pending')) {
    return 'pending';
  }

  if (statuses.some((status) => !isTerminal(status))) {
    return 'running';
  }

  if (statuses.includes('failed')) {
    return 'failed';
  }

  if (statuses.includes('canceled')) {
    return 'canceled';
  }

  return 'success';
}

export function isPipelineFinished(status: PipelineStatus): boolean {
  return status === 'success' || status === 'failed' || status === 'canceled';
}
