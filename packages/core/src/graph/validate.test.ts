import { describe, expect, it } from 'vitest';
import { ConfigError } from '../config/errors.js';
import { normalizeConfig } from '../config/normalize.js';
import { parseConfig } from '../config/parse.js';
import { validatePipeline } from './validate.js';

const validate = (yaml: string) => validatePipeline(normalizeConfig(parseConfig(yaml)));

describe('validatePipeline', () => {
  it('accepts a valid pipeline and returns its graph', () => {
    const graph = validate(`
stages: [build, test]
jobs:
  compile:
    stage: build
    script: echo
  unit:
    stage: test
    needs: [compile]
    script: echo
`);
    expect([...graph.nodes.keys()].sort()).toEqual(['compile', 'unit']);
  });

  it('allows needs within the same stage', () => {
    expect(() =>
      validate(`
stages: [test]
jobs:
  a:
    stage: test
    script: echo
  b:
    stage: test
    needs: [a]
    script: echo
`),
    ).not.toThrow();
  });

  it('rejects needs pointing at a later stage', () => {
    try {
      validate(`
stages: [build, deploy]
jobs:
  compile:
    stage: build
    needs: [ship]
    script: echo
  ship:
    stage: deploy
    script: echo
`);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).format()).toContain('later stage "deploy"');
    }
  });

  it('reports every problem at once', () => {
    try {
      validate(`
stages: [build, deploy]
jobs:
  a:
    stage: build
    needs: [b]
    script: echo
  b:
    stage: deploy
    needs: [c]
    script: echo
  c:
    stage: deploy
    needs: [b]
    script: echo
`);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ConfigError).issues.length).toBeGreaterThan(1);
    }
  });
});
