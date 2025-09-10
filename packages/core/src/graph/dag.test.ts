import { describe, expect, it } from 'vitest';
import { ConfigError } from '../config/errors.js';
import { normalizeConfig } from '../config/normalize.js';
import { parseConfig } from '../config/parse.js';
import { assertAcyclic, findCycle } from './cycles.js';
import { buildGraph } from './dag.js';

const graphOf = (yaml: string) => buildGraph(normalizeConfig(parseConfig(yaml)));

describe('buildGraph', () => {
  it('records dependencies and dependents in both directions', () => {
    const graph = graphOf(`
jobs:
  build:
    script: echo
  test:
    script: echo
    needs: [build]
  lint:
    script: echo
    needs: [build]
`);

    expect(graph.nodes.get('build')?.dependencies).toEqual([]);
    expect(graph.nodes.get('build')?.dependents.sort()).toEqual(['lint', 'test']);
    expect(graph.nodes.get('test')?.dependencies).toEqual(['build']);
    expect(graph.nodes.get('test')?.dependents).toEqual([]);
  });

  it('rejects needs pointing at an unknown job', () => {
    expect(() => graphOf('jobs:\n  a:\n    script: echo\n    needs: [ghost]\n')).toThrow(
      ConfigError,
    );
  });
});

describe('findCycle', () => {
  it('returns null for an acyclic graph', () => {
    const graph = graphOf(`
jobs:
  a:
    script: echo
  b:
    script: echo
    needs: [a]
  c:
    script: echo
    needs: [b]
`);
    expect(findCycle(graph)).toBeNull();
    expect(() => assertAcyclic(graph)).not.toThrow();
  });

  it('detects a two job cycle', () => {
    const graph = graphOf(`
jobs:
  a:
    script: echo
    needs: [b]
  b:
    script: echo
    needs: [a]
`);
    expect(findCycle(graph)).not.toBeNull();
    expect(() => assertAcyclic(graph)).toThrow(/dependency cycle/);
  });

  it('detects a longer cycle and names every job involved', () => {
    const graph = graphOf(`
jobs:
  a:
    script: echo
    needs: [c]
  b:
    script: echo
    needs: [a]
  c:
    script: echo
    needs: [b]
`);
    const cycle = findCycle(graph);
    expect(cycle).not.toBeNull();
    expect(new Set(cycle as readonly string[])).toEqual(new Set(['a', 'b', 'c']));
  });

  it('detects a job depending on itself', () => {
    const graph = graphOf('jobs:\n  a:\n    script: echo\n    needs: [a]\n');
    expect(findCycle(graph)).toEqual(['a', 'a']);
  });

  it('ignores diamonds, which are not cycles', () => {
    const graph = graphOf(`
jobs:
  root:
    script: echo
  left:
    script: echo
    needs: [root]
  right:
    script: echo
    needs: [root]
  join:
    script: echo
    needs: [left, right]
`);
    expect(findCycle(graph)).toBeNull();
  });
});
