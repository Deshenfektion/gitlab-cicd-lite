import { describe, expect, it } from 'vitest';
import { ArgumentError, parseArgs } from './args.js';

describe('parseArgs', () => {
  it('defaults to .ci.yml and the docker executor', () => {
    expect(parseArgs(['run'])).toEqual({
      command: 'run',
      file: '.ci.yml',
      executor: 'docker',
      concurrency: 4,
      verbose: false,
      dataDir: '.cicd',
    });
  });

  it('accepts a positional file', () => {
    expect(parseArgs(['run', 'pipeline.yml']).file).toBe('pipeline.yml');
  });

  it('parses every option', () => {
    const args = parseArgs([
      'run',
      'p.yml',
      '--executor',
      'shell',
      '--concurrency',
      '8',
      '--data-dir',
      '/tmp/ci',
      '--verbose',
    ]);

    expect(args).toEqual({
      command: 'run',
      file: 'p.yml',
      executor: 'shell',
      concurrency: 8,
      verbose: true,
      dataDir: '/tmp/ci',
    });
  });

  it('supports the short verbose flag', () => {
    expect(parseArgs(['run', '-v']).verbose).toBe(true);
  });

  it('requires a command', () => {
    expect(() => parseArgs([])).toThrow(ArgumentError);
    expect(() => parseArgs(['--verbose'])).toThrow(ArgumentError);
  });

  it('rejects an unknown executor', () => {
    expect(() => parseArgs(['run', '--executor', 'kubernetes'])).toThrow(/unknown executor/);
  });

  it('rejects an option without a value', () => {
    expect(() => parseArgs(['run', '--executor'])).toThrow(/requires a value/);
  });

  it('rejects a non positive concurrency', () => {
    expect(() => parseArgs(['run', '--concurrency', '0'])).toThrow(/positive integer/);
    expect(() => parseArgs(['run', '--concurrency', 'many'])).toThrow(/positive integer/);
  });

  it('rejects unknown options', () => {
    expect(() => parseArgs(['run', '--turbo'])).toThrow(/unknown option/);
  });

  it('rejects a second positional argument', () => {
    expect(() => parseArgs(['run', 'a.yml', 'b.yml'])).toThrow(/unexpected argument/);
  });
});
