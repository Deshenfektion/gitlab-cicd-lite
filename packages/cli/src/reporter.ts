import type { JobStatus, LogLine, PipelineStatus, RunListener } from '@cicd/core';

const RESET = '\u001b[0m';

const COLOURS: Record<string, string> = {
  pending: '\u001b[90m',
  running: '\u001b[34m',
  success: '\u001b[32m',
  failed: '\u001b[31m',
  canceled: '\u001b[33m',
  skipped: '\u001b[90m',
};

const SYMBOLS: Record<string, string> = {
  pending: '·',
  running: '›',
  success: '✓',
  failed: '✗',
  canceled: '■',
  skipped: '-',
};

export interface ReporterOptions {
  readonly verbose: boolean;
  readonly colour: boolean;
  write(text: string): void;
}

export class ConsoleReporter {
  constructor(private readonly options: ReporterOptions) {}

  listener(): RunListener {
    return {
      onJobStarted: (name, attempt) => {
        const suffix = attempt > 1 ? ` (attempt ${attempt})` : '';
        this.line('running', `${name}${suffix}`);
      },
      onJobLog: (name, _attempt, log) => {
        if (this.options.verbose) {
          this.log(name, log);
        }
      },
      onJobFinished: (name, _attempt, outcome, status) => {
        if (status === 'pending') {
          this.line('canceled', `${name} failed, retrying`);
          return;
        }
        const detail =
          outcome.kind === 'failure' && outcome.message !== undefined
            ? ` — ${outcome.message}`
            : '';
        this.line(status, `${name}${detail}`);
      },
      onJobStatusChanged: (name, status) => {
        if (status === 'skipped' || status === 'canceled') {
          this.line(status, name);
        }
      },
    };
  }

  summary(status: PipelineStatus, durationMs: number): void {
    this.options.write('\n');
    this.line(status, `pipeline ${status} in ${Math.round(durationMs / 100) / 10}s`);
  }

  private log(jobName: string, log: LogLine): void {
    const prefix = this.paint('\u001b[90m', `  ${jobName} │ `);
    const text =
      log.stream === 'stderr' ? this.paint(COLOURS.failed as string, log.text) : log.text;
    this.options.write(`${prefix}${text}\n`);
  }

  private line(status: JobStatus | PipelineStatus, text: string): void {
    const colour = COLOURS[status] ?? '';
    const symbol = SYMBOLS[status] ?? '·';
    this.options.write(`${this.paint(colour, symbol)} ${text}\n`);
  }

  private paint(colour: string, text: string): string {
    return this.options.colour ? `${colour}${text}${RESET}` : text;
  }
}
