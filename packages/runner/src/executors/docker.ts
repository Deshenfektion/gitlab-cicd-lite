import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { JobContext, JobExecutor, JobOutcome } from '@cicd/core';
import { failure, success } from '@cicd/core';
import type { ContainerHandle, DockerClient } from '../docker/client.js';
import { DockerStreamDemultiplexer } from '../docker/demultiplex.js';
import { LineSplitter } from '../logs/line-splitter.js';
import { buildShellScript } from '../script.js';

export const CONTAINER_WORKDIR = '/workspace';

export interface DockerExecutorOptions {
  readonly client: DockerClient;
  readonly workspaceRoot: string;
  readonly stopTimeoutSeconds?: number;
}

export class DockerExecutor implements JobExecutor {
  readonly id = 'docker';

  constructor(private readonly options: DockerExecutorOptions) {}

  async run(context: JobContext): Promise<JobOutcome> {
    const workspace = join(this.options.workspaceRoot, context.pipelineId, context.jobName);
    await mkdir(workspace, { recursive: true });

    const image = context.definition.image;
    let container: ContainerHandle | null = null;

    try {
      await this.ensureImage(image, context);

      container = await this.options.client.createContainer({
        image,
        command: ['/bin/sh', '-c', buildShellScript(context.definition.script)],
        workingDir: CONTAINER_WORKDIR,
        env: ['CI=true', `CI_JOB_NAME=${context.jobName}`, `CI_PIPELINE_ID=${context.pipelineId}`],
        binds: [`${workspace}:${CONTAINER_WORKDIR}`],
        labels: {
          'cicd.pipeline': context.pipelineId,
          'cicd.job': context.jobName,
          'cicd.attempt': String(context.attempt),
        },
      });

      return await this.supervise(container, context);
    } catch (error) {
      return failure('runner_failure', null, describe(error));
    } finally {
      if (container !== null) {
        await this.cleanUp(container);
      }
    }
  }

  private async ensureImage(image: string, context: JobContext): Promise<void> {
    if (await this.options.client.hasImage(image)) {
      return;
    }

    context.onLog({ stream: 'stdout', text: `Pulling image ${image}` });
    await this.options.client.pullImage(image, (message) => {
      context.onLog({ stream: 'stdout', text: message });
    });
  }

  private async supervise(container: ContainerHandle, context: JobContext): Promise<JobOutcome> {
    const stdout = new LineSplitter((text) => context.onLog({ stream: 'stdout', text }));
    const stderr = new LineSplitter((text) => context.onLog({ stream: 'stderr', text }));

    const demultiplexer = new DockerStreamDemultiplexer((frame) => {
      const target = frame.stream === 'stderr' ? stderr : stdout;
      target.push(frame.payload.toString('utf8'));
    });

    const stream = await container.attach();
    stream.on('data', (chunk: Buffer) => demultiplexer.push(chunk));

    const onAbort = (): void => {
      void container.stop(this.options.stopTimeoutSeconds ?? 5).catch(() => undefined);
    };
    context.signal.addEventListener('abort', onAbort, { once: true });

    try {
      await container.start();
      const exitCode = await container.wait();

      stdout.flush();
      stderr.flush();

      if (context.signal.aborted) {
        return failure('runner_failure', exitCode, 'job was aborted');
      }
      if (exitCode === 0) {
        return success(0);
      }
      return failure('script_failure', exitCode, `script exited with code ${exitCode}`);
    } finally {
      context.signal.removeEventListener('abort', onAbort);
    }
  }

  private async cleanUp(container: ContainerHandle): Promise<void> {
    try {
      await container.remove();
    } catch {
      return;
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
