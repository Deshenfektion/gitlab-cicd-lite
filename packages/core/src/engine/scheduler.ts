import type { JobDefinition, JobStatus, PipelineStatus } from '../config/types.js';
import { requireNode, type PipelineGraph } from '../graph/dag.js';
import { topologicalOrder } from '../graph/topology.js';
import { derivePipelineStatus } from '../state/pipeline-status.js';
import { assertTransition, isTerminal } from '../state/transitions.js';
import type { JobOutcome } from './outcome.js';
import { backoffMs, shouldRetry } from './retry.js';

export interface JobSnapshot {
  readonly name: string;
  readonly status: JobStatus;
  readonly attempt: number;
}

export interface CompletionResult {
  readonly accepted: boolean;
  readonly retryScheduled: boolean;
  readonly retryDelayMs?: number;
}

interface JobState {
  status: JobStatus;
  attempt: number;
}

export class PipelineScheduler {
  private readonly states = new Map<string, JobState>();
  private readonly order: readonly string[];

  constructor(private readonly graph: PipelineGraph) {
    this.order = topologicalOrder(graph);
    for (const name of this.order) {
      this.states.set(name, { status: 'pending', attempt: 0 });
    }
  }

  get status(): PipelineStatus {
    return derivePipelineStatus(this.order.map((name) => this.effectiveStatusOf(name)));
  }

  get finished(): boolean {
    return this.order.every((name) => isTerminal(this.stateOf(name).status));
  }

  snapshot(): readonly JobSnapshot[] {
    return this.order.map((name) => ({ name, ...this.stateOf(name) }));
  }

  statusOf(name: string): JobStatus {
    return this.stateOf(name).status;
  }

  attemptOf(name: string): number {
    return this.stateOf(name).attempt;
  }

  definitionOf(name: string): JobDefinition {
    return requireNode(this.graph, name).job;
  }

  ready(): readonly string[] {
    return this.order.filter((name) => {
      if (this.stateOf(name).status !== 'pending') {
        return false;
      }
      return requireNode(this.graph, name).dependencies.every(
        (dependency) => this.effectiveStatusOf(dependency) === 'success',
      );
    });
  }

  start(name: string): number {
    const state = this.stateOf(name);
    assertTransition(state.status, 'running');
    state.status = 'running';
    state.attempt += 1;
    return state.attempt;
  }

  complete(name: string, outcome: JobOutcome): CompletionResult {
    const state = this.stateOf(name);
    if (state.status !== 'running') {
      return { accepted: false, retryScheduled: false };
    }

    if (outcome.kind === 'success') {
      this.transition(name, 'success');
      return { accepted: true, retryScheduled: false };
    }

    this.transition(name, 'failed');

    const decision = shouldRetry(this.definitionOf(name).retry, outcome.reason, state.attempt);
    if (decision.retry) {
      this.transition(name, 'pending');
      return { accepted: true, retryScheduled: true, retryDelayMs: backoffMs(state.attempt) };
    }

    if (!this.definitionOf(name).allowFailure) {
      this.skipDependentsOf(name);
    }
    return { accepted: true, retryScheduled: false };
  }

  cancel(): readonly string[] {
    const affected: string[] = [];
    for (const name of this.order) {
      const state = this.stateOf(name);
      if (isTerminal(state.status)) {
        continue;
      }
      const wasRunning = state.status === 'running';
      this.transition(name, 'canceled');
      if (wasRunning) {
        affected.push(name);
      }
    }
    return affected;
  }

  private effectiveStatusOf(name: string): JobStatus {
    const status = this.stateOf(name).status;
    if (status === 'failed' && this.definitionOf(name).allowFailure) {
      return 'success';
    }
    return status;
  }

  private skipDependentsOf(name: string): void {
    const queue = [...requireNode(this.graph, name).dependents];

    while (queue.length > 0) {
      const dependent = queue.shift() as string;
      if (this.stateOf(dependent).status !== 'pending') {
        continue;
      }
      this.transition(dependent, 'skipped');
      queue.push(...requireNode(this.graph, dependent).dependents);
    }
  }

  private transition(name: string, to: JobStatus): void {
    const state = this.stateOf(name);
    assertTransition(state.status, to);
    state.status = to;
  }

  private stateOf(name: string): JobState {
    const state = this.states.get(name);
    if (state === undefined) {
      throw new Error(`Unknown job "${name}"`);
    }
    return state;
  }
}
