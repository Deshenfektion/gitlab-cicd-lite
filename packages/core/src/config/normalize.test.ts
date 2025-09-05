import { describe, expect, it } from 'vitest';
import { ConfigError } from './errors.js';
import { normalizeConfig, DEFAULT_IMAGE, DEFAULT_ARTIFACT_TTL_MS } from './normalize.js';
import { parseConfig } from './parse.js';

const normalize = (yaml: string) => normalizeConfig(parseConfig(yaml));

describe('normalizeConfig', () => {
  it('applies the default stage list', () => {
    const pipeline = normalize('jobs:\n  a:\n    script: echo\n');
    expect(pipeline.stages).toEqual(['build', 'test', 'deploy']);
    expect(pipeline.jobs[0]?.stage).toBe('test');
  });

  it('falls back to the first stage when test is not declared', () => {
    const pipeline = normalize('stages: [prepare, ship]\njobs:\n  a:\n    script: echo\n');
    expect(pipeline.jobs[0]?.stage).toBe('prepare');
  });

  it('inherits image, timeout and retry from defaults', () => {
    const pipeline = normalize(`
default:
  image: node:22-alpine
  timeout: 15m
  retry: 3
jobs:
  a:
    script: echo
  b:
    image: python:3.12
    timeout: 1m
    script: echo
`);
    const [a, b] = pipeline.jobs;
    expect(a?.image).toBe('node:22-alpine');
    expect(a?.timeoutMs).toBe(900_000);
    expect(a?.retry).toEqual({ max: 3, when: ['always'] });
    expect(b?.image).toBe('python:3.12');
    expect(b?.timeoutMs).toBe(60_000);
  });

  it('uses a built in image when nothing is configured', () => {
    const pipeline = normalize('jobs:\n  a:\n    script: echo\n');
    expect(pipeline.jobs[0]?.image).toBe(DEFAULT_IMAGE);
  });

  it('wraps a scalar script into a list', () => {
    const pipeline = normalize('jobs:\n  a:\n    script: echo hi\n');
    expect(pipeline.jobs[0]?.script).toEqual(['echo hi']);
  });

  it('expands the object form of retry', () => {
    const pipeline = normalize(`
jobs:
  a:
    script: echo
    retry:
      max: 2
      when: [timeout, runner_failure]
`);
    expect(pipeline.jobs[0]?.retry).toEqual({ max: 2, when: ['timeout', 'runner_failure'] });
  });

  it('deduplicates needs', () => {
    const pipeline = normalize(`
jobs:
  a:
    script: echo
  b:
    script: echo
    needs: [a, a]
`);
    expect(pipeline.jobs[1]?.needs).toEqual(['a']);
  });

  it('names artifacts after the job and applies the default retention', () => {
    const pipeline = normalize(`
jobs:
  a:
    script: echo
    artifacts:
      paths: [dist]
`);
    expect(pipeline.jobs[0]?.artifacts).toEqual({
      name: 'a',
      paths: ['dist'],
      expireInMs: DEFAULT_ARTIFACT_TTL_MS,
    });
  });

  it('rejects jobs referencing an undeclared stage', () => {
    expect(() =>
      normalize('stages: [build]\njobs:\n  a:\n    stage: nope\n    script: echo\n'),
    ).toThrow(ConfigError);
  });

  it('rejects duplicate stages', () => {
    expect(() => normalize('stages: [build, build]\njobs:\n  a:\n    script: echo\n')).toThrow(
      ConfigError,
    );
  });
});
