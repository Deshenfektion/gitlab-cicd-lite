import { useEffect, useRef } from 'react';
import type { JobStatus, LogLine, PipelineStatus } from '../api/types.js';

export interface JobLogEvent {
  readonly type: 'job.log';
  readonly jobId: string;
  readonly jobName: string;
  readonly attempt: number;
  readonly seq: number;
  readonly stream: LogLine['stream'];
  readonly message: string;
}

export interface JobStatusEvent {
  readonly type: 'job.status';
  readonly jobId: string;
  readonly jobName: string;
  readonly status: JobStatus;
  readonly attempt: number;
}

export interface PipelineStatusEvent {
  readonly type: 'pipeline.status';
  readonly status: PipelineStatus;
}

export type PipelineEvent = JobLogEvent | JobStatusEvent | PipelineStatusEvent;

const EVENT_TYPES = ['job.log', 'job.status', 'pipeline.status'] as const;

export function useEventStream(
  pipelineId: string | null,
  onEvent: (event: PipelineEvent) => void,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (pipelineId === null || pipelineId.length === 0) {
      return;
    }

    const source = new EventSource(`/api/pipelines/${pipelineId}/events`);

    const listener = (event: MessageEvent<string>): void => {
      try {
        handlerRef.current(JSON.parse(event.data) as PipelineEvent);
      } catch {
        return;
      }
    };

    for (const type of EVENT_TYPES) {
      source.addEventListener(type, listener as EventListener);
    }

    return () => {
      for (const type of EVENT_TYPES) {
        source.removeEventListener(type, listener as EventListener);
      }
      source.close();
    };
  }, [pipelineId]);
}
