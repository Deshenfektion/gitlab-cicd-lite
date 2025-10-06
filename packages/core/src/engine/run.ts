import { formatDuration } from '../config/duration.js';
import type { JobStatus, PipelineStatus } from '../config/types.js';
import type { PipelineGraph } from '../graph/dag.js';
import type { JobExecutor, LogLine } from './executor.js';
import { failure, type JobOutcome } from './outcome.js';
import { PipelineScheduler } from './scheduler.js';

export interface RunListener {
  onJobStarted?(name: string, attempt: number): void;
  onJobLog?(name: string, attempt: number, line: LogLine): void;
  onJobFinished?(name: string, attempt: number, outcome: JobOutcome, status: JobStatus): void;
  onJobSkipped?(name: string): void;
  onStatusChanged?(status: PipelineStatus): void;
}

export interface RunOptions {
  readonly pipelineId?: string;
  readonly concurrency?: number;
  readonly listener?: RunListener;
  readonly delay?: (ms: number) => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class PipelineRun {
  readonly scheduler: PipelineScheduler;

  private readonly pipelineId: string;
  private readonly concurrency: number;
  private readonly listener: RunListener;
  private readonly delay: (ms: number) => Promise<void>;

  private readonly controllers = new Map<string, AbortController>();
  private readonly held = new Set<string>();

  private inFlight = 0;
  private signaled = false;
  private wake: (() => void) | null = null;
  private lastStatus: PipelineStatus;
  private started = false;

  constructor(
    graph: PipelineGraph,
    private readonly executor: JobExecutor,
    options: RunOptions = {},
  ) {
    this.scheduler = new PipelineScheduler(graph);
    this.pipelineId = options.pipelineId ?? 'local';
    this.concurrency = Math.max(1, options.concurrency ?? 4);
    this.listener = options.listener ?? {};
    this.delay = options.delay ?? sleep;
    this.lastStatus = this.scheduler.status;
  }

  async start(): Promise<PipelineStatus> {
    if (this.started) {
      throw new Error('Pipeline run already started');
    }
    this.started = true;

    while (!this.scheduler.finished) {
      this.launchReady();

      if (this.inFlight === 0 && this.held.size === 0) {
        break;
      }

      await this.waitForProgress();
    }

    this.emitStatus();
    return this.scheduler.status;
  }

  cancel(): void {
    const interrupted = this.scheduler.cancel();
    for (const name of interrupted) {
      this.controllers.get(name)?.abort();
    }
    this.held.clear();
    this.notify();
  }

  private launchReady(): void {
    for (const name of this.scheduler.ready()) {
      if (this.inFlight >= this.concurrency) {
        return;
      }
      if (this.held.has(name)) {
        continue;
      }
      void this.launch(name);
    }
    this.emitStatus();
  }

  private async launch(name: string): Promise<void> {
    const attempt = this.scheduler.start(name);
    this.inFlight += 1;
    this.emitStatus();
    this.listener.onJobStarted?.(name, attempt);

    let outcome: JobOutcome;
    try {
      outcome = await this.execute(name, attempt);
    } catch (error) {
      outcome = failure('runner_failure', null, describe(error));
    }

    this.inFlight -= 1;

    const before = new Map(this.scheduler.snapshot().map((job) => [job.name, job.status]));
    const result = this.scheduler.complete(name, outcome);

    if (result.accepted) {
      this.listener.onJobFinished?.(name, attempt, outcome, this.scheduler.statusOf(name));
      this.reportSkips(before);

      if (result.retryScheduled) {
        this.hold(name, result.retryDelayMs ?? 0);
      }
    }

    this.notify();
  }

  private async execute(name: string, attempt: number): Promise<JobOutcome> {
    const definition = this.scheduler.definitionOf(name);
    const controller = new AbortController();
    this.controllers.set(name, controller);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<JobOutcome>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(
          failure(
            'timeout',
            null,
            `job exceeded its timeout of ${formatDuration(definition.timeoutMs)}`,
          ),
        );
      }, definition.timeoutMs);
    });

    try {
      return await Promise.race([
        this.executor.run({
          pipelineId: this.pipelineId,
          jobName: name,
          attempt,
          definition,
          signal: controller.signal,
          onLog: (line) => this.listener.onJobLog?.(name, attempt, line),
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
      this.controllers.delete(name);
    }
  }

  private hold(name: string, delayMs: number): void {
    this.held.add(name);
    void this.delay(delayMs).then(() => {
      this.held.delete(name);
      this.notify();
    });
  }

  private reportSkips(before: ReadonlyMap<string, JobStatus>): void {
    for (const job of this.scheduler.snapshot()) {
      if (job.status === 'skipped' && before.get(job.name) !== 'skipped') {
        this.listener.onJobSkipped?.(job.name);
      }
    }
  }

  private emitStatus(): void {
    const status = this.scheduler.status;
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.listener.onStatusChanged?.(status);
    }
  }

  private notify(): void {
    this.signaled = true;
    if (this.wake !== null) {
      const wake = this.wake;
      this.wake = null;
      wake();
    }
  }

  private async waitForProgress(): Promise<void> {
    if (this.signaled) {
      this.signaled = false;
      return;
    }
    await new Promise<void>((resolve) => {
      this.wake = resolve;
    });
    this.signaled = false;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
