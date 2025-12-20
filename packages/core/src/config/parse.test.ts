import { describe, expect, it } from 'vitest';
import { ConfigError } from './errors.js';
import { parseConfig } from './parse.js';

const valid = `
stages:
  - build
  - test

default:
  image: node:22-alpine
  timeout: 30m

jobs:
  compile:
    stage: build
    script:
      - npm ci
      - npm run build
    artifacts:
      paths:
        - dist
      expire_in: 7d
  unit:
    stage: test
    needs: [compile]
    script: npm test
    retry: 2
`;

describe('parseConfig', () => {
  it('accepts a complete configuration', () => {
    const config = parseConfig(valid);
    expect(config.stages).toEqual(['build', 'test']);
    expect(Object.keys(config.jobs)).toEqual(['compile', 'unit']);
    expect(config.default?.image).toBe('node:22-alpine');
    expect(config.jobs.compile?.artifacts?.paths).toEqual(['dist']);
  });

  it('accepts a scalar script and scalar needs', () => {
    const config = parseConfig(
      'jobs:\n  a:\n    script: echo hi\n  b:\n    script: echo bye\n    needs: a\n',
    );
    expect(config.jobs.a?.script).toBe('echo hi');
    expect(config.jobs.b?.needs).toBe('a');
  });

  it('rejects empty documents', () => {
    expect(() => parseConfig('')).toThrow(ConfigError);
    expect(() => parseConfig('\n# nothing here\n')).toThrow(ConfigError);
  });

  it('reports malformed yaml with a line number', () => {
    try {
      parseConfig('jobs:\n  a:\n   script: [1, 2\n');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).issues[0]?.path).toMatch(/^line \d+$/);
    }
  });

  it('rejects unknown job keys', () => {
    try {
      parseConfig('jobs:\n  a:\n    script: echo\n    scritp: typo\n');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).format()).toContain('jobs.a');
    }
  });

  it('requires a script', () => {
    expect(() => parseConfig('jobs:\n  a:\n    stage: build\n')).toThrow(ConfigError);
  });

  it('rejects invalid durations', () => {
    expect(() => parseConfig('jobs:\n  a:\n    script: echo\n    timeout: soon\n')).toThrow(
      ConfigError,
    );
  });

  it('rejects a retry count outside the supported range', () => {
    expect(() => parseConfig('jobs:\n  a:\n    script: echo\n    retry: 99\n')).toThrow(
      ConfigError,
    );
  });

  it('formats issue paths through nested arrays', () => {
    try {
      parseConfig('jobs:\n  a:\n    script: echo\n    needs: ["ok", ""]\n');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ConfigError).issues[0]?.path).toBe('jobs.a.needs[1]');
    }
  });
});

describe('validation messages', () => {
  const messageFor = (yaml: string): string => {
    try {
      parseConfig(yaml);
      return '';
    } catch (error) {
      return (error as ConfigError).issues.map((issue) => issue.message).join(' | ');
    }
  };

  it('explains what a script may be', () => {
    expect(messageFor('jobs:\n  a:\n    script: true\n')).toContain(
      'must be a command or a non-empty list of commands',
    );
  });

  it('explains what needs may be', () => {
    expect(messageFor('jobs:\n  a:\n    script: e\n    needs: 42\n')).toContain(
      'must be a job name or a list of job names',
    );
  });

  it('explains what retry may be and lists the valid triggers', () => {
    for (const yaml of [
      'jobs:\n  a:\n    script: e\n    retry: sometimes\n',
      'jobs:\n  a:\n    script: e\n    retry:\n      max: 1\n      when: whenever\n',
    ]) {
      const message = messageFor(yaml);
      expect(message).toContain('must be a retry count');
      expect(message).toContain('script_failure');
      expect(message).toContain('timeout');
    }
  });

  it('still points at the offending path', () => {
    try {
      parseConfig('jobs:\n  build:\n    script: true\n');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ConfigError).issues[0]?.path).toBe('jobs.build.script');
    }
  });
});
