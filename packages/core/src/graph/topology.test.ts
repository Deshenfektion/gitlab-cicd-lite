import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../config/normalize.js';
import { parseConfig } from '../config/parse.js';
import { buildGraph } from './dag.js';
import { topologicalLayers, topologicalOrder } from './topology.js';

const graphOf = (yaml: string) => buildGraph(normalizeConfig(parseConfig(yaml)));

describe('topologicalOrder', () => {
  it('places every job after all of its dependencies', () => {
    const graph = graphOf(`
jobs:
  a:
    script: echo
  b:
    script: echo
    needs: [a]
  c:
    script: echo
    needs: [a]
  d:
    script: echo
    needs: [b, c]
`);
    const order = topologicalOrder(graph);
    expect(order).toHaveLength(4);
    for (const [name, node] of graph.nodes) {
      for (const dependency of node.dependencies) {
        expect(order.indexOf(dependency)).toBeLessThan(order.indexOf(name));
      }
    }
  });

  it('is deterministic for independent jobs', () => {
    const yaml = 'jobs:\n  zeta:\n    script: echo\n  alpha:\n    script: echo\n';
    expect(topologicalOrder(graphOf(yaml))).toEqual(['alpha', 'zeta']);
  });

  it('throws when the graph contains a cycle', () => {
    const graph = graphOf(`
jobs:
  a:
    script: echo
    needs: [b]
  b:
    script: echo
    needs: [a]
`);
    expect(() => topologicalOrder(graph)).toThrow(/dependency cycle/);
  });
});

describe('topologicalLayers', () => {
  it('groups jobs that can run at the same time', () => {
    const graph = graphOf(`
jobs:
  build:
    script: echo
  lint:
    script: echo
    needs: [build]
  unit:
    script: echo
    needs: [build]
  deploy:
    script: echo
    needs: [lint, unit]
`);
    expect(topologicalLayers(graph)).toEqual([['build'], ['lint', 'unit'], ['deploy']]);
  });

  it('pushes a job down to the deepest of its dependencies', () => {
    const graph = graphOf(`
jobs:
  a:
    script: echo
  b:
    script: echo
    needs: [a]
  c:
    script: echo
    needs: [a, b]
`);
    expect(topologicalLayers(graph)).toEqual([['a'], ['b'], ['c']]);
  });

  it('derives layers from stages when needs is omitted', () => {
    const graph = graphOf(`
stages: [build, test, deploy]
jobs:
  compile:
    stage: build
    script: echo
  unit:
    stage: test
    script: echo
  e2e:
    stage: test
    script: echo
  ship:
    stage: deploy
    script: echo
`);
    expect(topologicalLayers(graph)).toEqual([['compile'], ['e2e', 'unit'], ['ship']]);
  });

  it('skips empty stages when linking stage dependencies', () => {
    const graph = graphOf(`
stages: [build, review, deploy]
jobs:
  compile:
    stage: build
    script: echo
  ship:
    stage: deploy
    script: echo
`);
    expect(topologicalLayers(graph)).toEqual([['compile'], ['ship']]);
  });

  it('puts fully independent jobs into a single layer', () => {
    const graph = graphOf('jobs:\n  a:\n    script: echo\n  b:\n    script: echo\n');
    expect(topologicalLayers(graph)).toEqual([['a', 'b']]);
  });
});
