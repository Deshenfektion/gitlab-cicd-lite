import type { JobDefinition } from '../config/types.js';
import type { JobOutcome } from './outcome.js';

export interface LogLine {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

export interface JobContext {
  readonly pipelineId: string;
  readonly jobName: string;
  readonly attempt: number;
  readonly definition: JobDefinition;
  readonly signal: AbortSignal;
  onLog(line: LogLine): void;
}

export interface JobExecutor {
  readonly id: string;
  run(context: JobContext): Promise<JobOutcome>;
}
