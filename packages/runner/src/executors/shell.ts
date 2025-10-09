import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { JobContext, JobExecutor, JobOutcome } from '@cicd/core';
import { failure, success } from '@cicd/core';
import { LineSplitter } from '../logs/line-splitter.js';
import { buildShellScript } from '../script.js';

export interface ShellExecutorOptions {
  readonly workspaceRoot: string;
  readonly shell?: string;
}

export class ShellExecutor implements JobExecutor {
  readonly id = 'shell';

  private readonly shell: string;

  constructor(private readonly options: ShellExecutorOptions) {
    this.shell = options.shell ?? '/bin/sh';
  }

  async run(context: JobContext): Promise<JobOutcome> {
    const cwd = join(this.options.workspaceRoot, context.pipelineId, context.jobName);
    await mkdir(cwd, { recursive: true });

    const script = buildShellScript(context.definition.script);

    return await new Promise<JobOutcome>((resolve) => {
      const child = spawn(this.shell, ['-s'], {
        cwd,
        env: { ...process.env, CI: 'true', CI_JOB_NAME: context.jobName },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const stdout = new LineSplitter((text) => context.onLog({ stream: 'stdout', text }));
      const stderr = new LineSplitter((text) => context.onLog({ stream: 'stderr', text }));

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => stdout.push(chunk));
      child.stderr.on('data', (chunk: string) => stderr.push(chunk));

      const onAbort = (): void => {
        child.kill('SIGTERM');
      };
      context.signal.addEventListener('abort', onAbort, { once: true });

      const settle = (outcome: JobOutcome): void => {
        stdout.flush();
        stderr.flush();
        context.signal.removeEventListener('abort', onAbort);
        resolve(outcome);
      };

      child.on('error', (error: Error) => {
        settle(failure('runner_failure', null, error.message));
      });

      child.on('close', (code, signal) => {
        if (context.signal.aborted) {
          settle(failure('runner_failure', code, 'job was aborted'));
          return;
        }
        if (code === 0) {
          settle(success(0));
          return;
        }
        settle(
          failure(
            'script_failure',
            code,
            signal === null ? `script exited with code ${code}` : `script killed by ${signal}`,
          ),
        );
      });

      child.stdin.end(script);
    });
  }
}
