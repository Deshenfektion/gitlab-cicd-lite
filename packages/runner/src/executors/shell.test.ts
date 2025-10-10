import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JobContext, JobDefinition, JobOutcome, LogLine } from '@cicd/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShellExecutor } from './shell.js';

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'cicd-shell-'));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

const definition = (script: readonly string[]): JobDefinition => ({
  name: 'job',
  stage: 'test',
  image: 'alpine:3.20',
  script,
  needs: [],
  artifacts: null,
  retry: { max: 0, when: ['always'] },
  timeoutMs: 60_000,
  allowFailure: false,
});

interface RunResult {
  readonly outcome: JobOutcome;
  readonly lines: readonly LogLine[];
}

async function run(
  script: readonly string[],
  signal = new AbortController().signal,
): Promise<RunResult> {
  const executor = new ShellExecutor({ workspaceRoot });
  const lines: LogLine[] = [];
  const context: JobContext = {
    pipelineId: 'p1',
    jobName: 'job',
    attempt: 1,
    definition: definition(script),
    signal,
    onLog: (line) => lines.push(line),
  };
  const outcome = await executor.run(context);
  return { outcome, lines };
}

const stdout = (lines: readonly LogLine[]): string[] =>
  lines.filter((line) => line.stream === 'stdout').map((line) => line.text);

describe('ShellExecutor', () => {
  it('succeeds with exit code zero', async () => {
    const { outcome } = await run(['true']);
    expect(outcome).toEqual({ kind: 'success', exitCode: 0 });
  });

  it('echoes each command before running it', async () => {
    const { lines } = await run(['echo hello', 'echo world']);
    expect(stdout(lines)).toEqual(['$ echo hello', 'hello', '$ echo world', 'world']);
  });

  it('captures stderr separately from stdout', async () => {
    const { lines } = await run(['echo out', 'echo err 1>&2']);
    expect(stdout(lines)).toContain('out');
    expect(lines.filter((line) => line.stream === 'stderr').map((line) => line.text)).toContain(
      'err',
    );
  });

  it('reports the exit code of a failing command', async () => {
    const { outcome } = await run(['exit 42']);
    expect(outcome).toMatchObject({ kind: 'failure', reason: 'script_failure', exitCode: 42 });
  });

  it('stops at the first failing command', async () => {
    const { outcome, lines } = await run(['echo first', 'false', 'echo never']);
    expect(outcome.kind).toBe('failure');
    expect(stdout(lines)).not.toContain('never');
  });

  it('runs commands inside a per job workspace', async () => {
    await run(['echo content > artifact.txt']);
    const file = join(workspaceRoot, 'p1', 'job', 'artifact.txt');
    await expect(readFile(file, 'utf8')).resolves.toBe('content\n');
  });

  it('keeps state between commands of the same job', async () => {
    const { lines } = await run(['export VALUE=42', 'echo $VALUE']);
    expect(stdout(lines)).toContain('42');
  });

  it('exposes CI environment variables', async () => {
    const { lines } = await run(['echo $CI $CI_JOB_NAME']);
    expect(stdout(lines)).toContain('true job');
  });

  it('emits a trailing line that is not newline terminated', async () => {
    const { lines } = await run(['printf no-newline']);
    expect(stdout(lines)).toContain('no-newline');
  });

  it('handles commands containing single quotes', async () => {
    const { lines } = await run([`echo "it's fine"`]);
    expect(stdout(lines)).toEqual([`$ echo "it's fine"`, "it's fine"]);
  });

  it('reports an aborted job as a runner failure', async () => {
    const controller = new AbortController();
    const pending = run(['sleep 5'], controller.signal);
    setTimeout(() => controller.abort(), 30);
    const { outcome } = await pending;
    expect(outcome).toMatchObject({ kind: 'failure', reason: 'runner_failure' });
  });

  it('fails cleanly when the shell binary does not exist', async () => {
    const executor = new ShellExecutor({ workspaceRoot, shell: '/nonexistent/sh' });
    const outcome = await executor.run({
      pipelineId: 'p1',
      jobName: 'job',
      attempt: 1,
      definition: definition(['true']),
      signal: new AbortController().signal,
      onLog: () => {},
    });
    expect(outcome).toMatchObject({ kind: 'failure', reason: 'runner_failure' });
  });
});
