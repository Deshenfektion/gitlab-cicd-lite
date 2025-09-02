export const JOB_STATUSES = [
  'pending',
  'running',
  'success',
  'failed',
  'canceled',
  'skipped',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const PIPELINE_STATUSES = ['pending', 'running', 'success', 'failed', 'canceled'] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const RETRY_TRIGGERS = ['always', 'script_failure', 'runner_failure', 'timeout'] as const;

export type RetryTrigger = (typeof RETRY_TRIGGERS)[number];

export interface RetryPolicy {
  readonly max: number;
  readonly when: readonly RetryTrigger[];
}

export interface ArtifactDefinition {
  readonly name: string;
  readonly paths: readonly string[];
  readonly expireInMs: number;
}

export interface JobDefinition {
  readonly name: string;
  readonly stage: string;
  readonly image: string;
  readonly script: readonly string[];
  readonly needs: readonly string[];
  readonly artifacts: ArtifactDefinition | null;
  readonly retry: RetryPolicy;
  readonly timeoutMs: number;
}

export interface PipelineDefinition {
  readonly stages: readonly string[];
  readonly jobs: readonly JobDefinition[];
}
