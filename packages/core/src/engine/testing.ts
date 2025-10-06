import type { JobContext, JobExecutor } from './executor.js';
import { failure, success, type JobOutcome } from './outcome.js';

export type ScriptedResult = JobOutcome | Error;

export interface FakeExecutorOptions {
  readonly results?: Readonly<Record<string, ScriptedResult | readonly ScriptedResult[]>>;
  readonly hold?: (context: JobContext) => Promise<void>;
}

export interface ExecutionRecord {
  readonly jobName: string;
  readonly attempt: number;
  readonly image: string;
}

export class FakeExecutor implements JobExecutor {
  readonly id = 'fake';
  readonly executions: ExecutionRecord[] = [];

  private concurrent = 0;
  private peak = 0;

  constructor(private readonly options: FakeExecutorOptions = {}) {}

  get peakConcurrency(): number {
    return this.peak;
  }

  async run(context: JobContext): Promise<JobOutcome> {
    this.executions.push({
      jobName: context.jobName,
      attempt: context.attempt,
      image: context.definition.image,
    });

    this.concurrent += 1;
    this.peak = Math.max(this.peak, this.concurrent);

    try {
      context.onLog({ stream: 'stdout', text: `running ${context.jobName}` });
      await this.options.hold?.(context);
      const result = this.resultFor(context.jobName, context.attempt);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    } finally {
      this.concurrent -= 1;
    }
  }

  private resultFor(jobName: string, attempt: number): ScriptedResult {
    const configured = this.options.results?.[jobName];
    if (configured === undefined) {
      return success();
    }
    if (Array.isArray(configured)) {
      const list = configured as readonly ScriptedResult[];
      return list[Math.min(attempt, list.length) - 1] ?? success();
    }
    return configured as ScriptedResult;
  }
}

export function scriptFailure(exitCode = 1): JobOutcome {
  return failure('script_failure', exitCode);
}

export function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
