import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';
import { execute, type CommandIo } from './commands.js';

let workdir: string;

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'cicd-cli-'));
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

interface Capture extends CommandIo {
  readonly out: string[];
  readonly err: string[];
}

function io(): Capture {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    colour: false,
    write: (text) => out.push(text),
    writeError: (text) => err.push(text),
  };
}

async function withConfig(yaml: string): Promise<string> {
  const file = join(workdir, 'pipeline.yml');
  await writeFile(file, yaml, 'utf8');
  return file;
}

const runCli = async (argv: readonly string[], capture: Capture) =>
  await execute(parseArgs([...argv, '--data-dir', join(workdir, '.cicd')]), capture);

describe('validate', () => {
  it('summarises a valid pipeline', async () => {
    const file = await withConfig(`
stages: [build, test]
jobs:
  compile:
    stage: build
    script: echo hi
  unit:
    stage: test
    needs: [compile]
    script: echo test
`);
    const capture = io();

    await expect(runCli(['validate', file], capture)).resolves.toBe(0);
    expect(capture.out.join('')).toContain('2 job(s) across 2 stage(s)');
    expect(capture.out.join('')).toContain('unit [test] needs compile');
  });

  it('reports configuration issues and exits with 2', async () => {
    const file = await withConfig('jobs:\n  a:\n    scritp: typo\n');
    const capture = io();

    await expect(runCli(['validate', file], capture)).resolves.toBe(2);
    expect(capture.err.join('')).toContain('jobs.a');
  });

  it('reports a dependency cycle', async () => {
    const file = await withConfig(
      'jobs:\n  a:\n    script: e\n    needs: [b]\n  b:\n    script: e\n    needs: [a]\n',
    );
    const capture = io();

    await expect(runCli(['validate', file], capture)).resolves.toBe(2);
    expect(capture.err.join('')).toContain('cycle');
  });

  it('reports a missing file', async () => {
    const capture = io();
    await expect(runCli(['validate', join(workdir, 'nope.yml')], capture)).resolves.toBe(2);
    expect(capture.err.join('')).toContain('not found');
  });
});

describe('graph', () => {
  it('prints the execution layers', async () => {
    const file = await withConfig(`
jobs:
  a:
    script: e
  b:
    script: e
    needs: [a]
  c:
    script: e
    needs: [a]
  d:
    script: e
    needs: [b, c]
`);
    const capture = io();

    await expect(runCli(['graph', file], capture)).resolves.toBe(0);
    expect(capture.out.join('')).toBe('1. a\n2. b, c\n3. d\n');
  });
});

describe('run', () => {
  it('runs a pipeline and exits with zero on success', async () => {
    const file = await withConfig(`
jobs:
  first:
    script: echo one
  second:
    script: echo two
    needs: [first]
`);
    const capture = io();

    await expect(runCli(['run', file, '--executor', 'shell'], capture)).resolves.toBe(0);

    const output = capture.out.join('');
    expect(output).toContain('✓ first');
    expect(output).toContain('✓ second');
    expect(output).toContain('pipeline success');
  });

  it('exits with one when the pipeline fails and skips downstream jobs', async () => {
    const file = await withConfig(`
jobs:
  broken:
    script: exit 4
  after:
    script: echo never
    needs: [broken]
`);
    const capture = io();

    await expect(runCli(['run', file, '--executor', 'shell'], capture)).resolves.toBe(1);

    const output = capture.out.join('');
    expect(output).toContain('✗ broken');
    expect(output).toContain('- after');
    expect(output).toContain('pipeline failed');
  });

  it('prints job output in verbose mode', async () => {
    const file = await withConfig('jobs:\n  talk:\n    script: echo hello-from-job\n');
    const capture = io();

    await runCli(['run', file, '--executor', 'shell', '--verbose'], capture);
    expect(capture.out.join('')).toContain('hello-from-job');
  });

  it('stays quiet about job output without verbose', async () => {
    const file = await withConfig('jobs:\n  talk:\n    script: echo hello-from-job\n');
    const capture = io();

    await runCli(['run', file, '--executor', 'shell'], capture);
    expect(capture.out.join('')).not.toContain('hello-from-job');
  });

  it('reports a tolerated failure without failing the run', async () => {
    const file = await withConfig(`
jobs:
  lint:
    script: exit 1
    allow_failure: true
`);
    const capture = io();

    await expect(runCli(['run', file, '--executor', 'shell'], capture)).resolves.toBe(0);
    expect(capture.out.join('')).toContain('pipeline success');
  });
});

describe('unknown commands', () => {
  it('exits with two', async () => {
    const capture = io();
    await expect(runCli(['deploy'], capture)).resolves.toBe(2);
    expect(capture.err.join('')).toContain('Unknown command');
  });
});
