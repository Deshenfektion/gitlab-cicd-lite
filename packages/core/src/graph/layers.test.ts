import { describe, expect, it } from 'vitest';
import { loadPipeline } from '../config/load.js';
import { buildGraph } from './dag.js';
import { layersFromEdges } from './layers.js';
import { topologicalLayers } from './topology.js';

describe('layersFromEdges', () => {
  it('groups independent nodes into one layer', () => {
    expect(layersFromEdges(['b', 'a'], [])).toEqual([['a', 'b']]);
  });

  it('places a node after its dependency', () => {
    expect(layersFromEdges(['a', 'b'], [{ from: 'a', to: 'b' }])).toEqual([['a'], ['b']]);
  });

  it('uses the deepest dependency', () => {
    const layers = layersFromEdges(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'c' },
      ],
    );
    expect(layers).toEqual([['a'], ['b'], ['c']]);
  });

  it('ignores edges that reference unknown nodes', () => {
    expect(layersFromEdges(['a'], [{ from: 'ghost', to: 'a' }])).toEqual([['a']]);
  });

  it('returns nothing for an empty pipeline', () => {
    expect(layersFromEdges([], [])).toEqual([]);
  });

  it('does not loop forever on a cyclic edge set', () => {
    const layers = layersFromEdges(
      ['a', 'b'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    );
    expect(layers.flat().sort()).toEqual(['a', 'b']);
  });

  it('agrees with the graph based layering', () => {
    const yaml = `
stages: [build, test, deploy]
jobs:
  compile:
    stage: build
    script: e
  unit:
    stage: test
    script: e
  e2e:
    stage: test
    needs: [compile]
    script: e
  ship:
    stage: deploy
    needs: [unit, e2e]
    script: e
`;
    const graph = buildGraph(loadPipeline(yaml).definition);
    const nodes = [...graph.nodes.keys()];
    const edges = nodes.flatMap((name) =>
      (graph.nodes.get(name)?.dependencies ?? []).map((from) => ({ from, to: name })),
    );

    expect(layersFromEdges(nodes, edges)).toEqual(topologicalLayers(graph));
  });
});
