import type {
  Artifact,
  ConfigIssue,
  Job,
  LogLine,
  Pipeline,
  PipelineDetail,
  Runner,
} from './types.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: readonly ConfigIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: string;
  issues?: readonly ConfigIssue[];
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init.body === undefined ? init.headers : { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(response.status, body.error ?? response.statusText, body.issues ?? []);
  }

  return (await response.json()) as T;
}

export const api = {
  listPipelines: (): Promise<{ pipelines: readonly Pipeline[] }> => send('/pipelines'),

  getPipeline: (id: string): Promise<PipelineDetail> => send(`/pipelines/${id}`),

  createPipeline: (input: { name?: string; config: string }): Promise<{ pipeline: Pipeline }> =>
    send('/pipelines', { method: 'POST', body: JSON.stringify(input) }),

  startPipeline: (id: string): Promise<{ pipeline: Pipeline }> =>
    send(`/pipelines/${id}/start`, { method: 'POST' }),

  cancelPipeline: (id: string): Promise<{ pipeline: Pipeline }> =>
    send(`/pipelines/${id}/cancel`, { method: 'POST' }),

  retryPipeline: (id: string): Promise<{ pipeline: Pipeline }> =>
    send(`/pipelines/${id}/retry`, { method: 'POST' }),

  retryJob: (id: string): Promise<{ job: Job }> => send(`/jobs/${id}/retry`, { method: 'POST' }),

  getJobLogs: (
    id: string,
    after = 0,
  ): Promise<{ jobId: string; lines: readonly LogLine[]; nextCursor: number }> =>
    send(`/jobs/${id}/logs?after=${after}`),

  listJobArtifacts: (id: string): Promise<{ artifacts: readonly Artifact[] }> =>
    send(`/jobs/${id}/artifacts`),

  listPipelineArtifacts: (id: string): Promise<{ artifacts: readonly Artifact[] }> =>
    send(`/pipelines/${id}/artifacts`),

  listRunners: (): Promise<{ runners: readonly Runner[] }> => send('/runners'),
};
