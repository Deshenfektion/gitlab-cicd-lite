import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigError, PipelineRun, loadPipeline, topologicalLayers } from '@cicd/core';
import { createExecutor } from '@cicd/runner';
import type { ParsedArgs } from './args.js';
import { ConsoleReporter } from './reporter.js';

export interface CommandIo {
  write(text: string): void;
  writeError(text: string): void;
  readonly colour: boolean;
}

async function read(file: string): Promise<string> {
  return await readFile(resolve(file), 'utf8');
}

export async function validate(args: ParsedArgs, io: CommandIo): Promise<number> {
  const { definition } = loadPipeline(await read(args.file));

  io.write(`${definition.jobs.length} job(s) across ${definition.stages.length} stage(s)\n`);
  for (const job of definition.jobs) {
    const needs = job.needs.length === 0 ? 'no dependencies' : `needs ${job.needs.join(', ')}`;
    io.write(`  ${job.name} [${job.stage}] ${needs}\n`);
  }

  return 0;
}

export async function graph(args: ParsedArgs, io: CommandIo): Promise<number> {
  const { graph: pipelineGraph } = loadPipeline(await read(args.file));

  topologicalLayers(pipelineGraph).forEach((layer, index) => {
    io.write(`${index + 1}. ${layer.join(', ')}\n`);
  });

  return 0;
}

export async function run(args: ParsedArgs, io: CommandIo): Promise<number> {
  const { graph: pipelineGraph } = loadPipeline(await read(args.file));

  const executor = createExecutor({
    kind: args.executor,
    workspaceRoot: resolve(args.dataDir, 'workspaces'),
    artifactRoot: resolve(args.dataDir, 'artifacts'),
  });

  const reporter = new ConsoleReporter({
    verbose: args.verbose,
    colour: io.colour,
    write: io.write.bind(io),
  });

  const pipeline = new PipelineRun(pipelineGraph, executor, {
    pipelineId: `cli-${Date.now().toString(36)}`,
    concurrency: args.concurrency,
    listener: reporter.listener(),
  });

  const startedAt = Date.now();
  const status = await pipeline.start();
  reporter.summary(status, Date.now() - startedAt);

  return status === 'success' ? 0 : 1;
}

export async function execute(args: ParsedArgs, io: CommandIo): Promise<number> {
  try {
    switch (args.command) {
      case 'run':
        return await run(args, io);
      case 'validate':
        return await validate(args, io);
      case 'graph':
        return await graph(args, io);
      default:
        io.writeError(`Unknown command "${args.command}"\n`);
        return 2;
    }
  } catch (error) {
    if (error instanceof ConfigError) {
      io.writeError(`${error.message}\n${error.format()}\n`);
      return 2;
    }
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      io.writeError(`Configuration file not found: ${args.file}\n`);
      return 2;
    }
    throw error;
  }
}
