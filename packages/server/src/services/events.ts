import type { JobStatus, PipelineStatus } from '@cicd/core';

export interface JobLogEvent {
  readonly type: 'job.log';
  readonly pipelineId: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly attempt: number;
  readonly seq: number;
  readonly stream: 'stdout' | 'stderr';
  readonly message: string;
}

export interface JobStatusEvent {
  readonly type: 'job.status';
  readonly pipelineId: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly status: JobStatus;
  readonly attempt: number;
}

export interface PipelineStatusEvent {
  readonly type: 'pipeline.status';
  readonly pipelineId: string;
  readonly status: PipelineStatus;
}

export type PipelineEvent = JobLogEvent | JobStatusEvent | PipelineStatusEvent;

export type EventListener = (event: PipelineEvent) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<EventListener>>();

  subscribe(pipelineId: string, listener: EventListener): () => void {
    const existing = this.listeners.get(pipelineId) ?? new Set<EventListener>();
    existing.add(listener);
    this.listeners.set(pipelineId, existing);

    return () => {
      const current = this.listeners.get(pipelineId);
      if (current === undefined) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(pipelineId);
      }
    };
  }

  publish(event: PipelineEvent): void {
    const listeners = this.listeners.get(event.pipelineId);
    if (listeners === undefined) {
      return;
    }

    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  subscriberCount(pipelineId: string): number {
    return this.listeners.get(pipelineId)?.size ?? 0;
  }
}
