import { assertAcyclic } from './cycles.js';
import { requireNode, type PipelineGraph } from './dag.js';

export function topologicalOrder(graph: PipelineGraph): readonly string[] {
  assertAcyclic(graph);

  const indegree = new Map<string, number>();
  for (const [name, node] of graph.nodes) {
    indegree.set(name, node.dependencies.length);
  }

  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([name]) => name)
    .sort();

  const order: string[] = [];

  while (ready.length > 0) {
    const name = ready.shift() as string;
    order.push(name);

    for (const dependent of requireNode(graph, name).dependents) {
      const remaining = (indegree.get(dependent) as number) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }

  return order;
}

export function topologicalLayers(graph: PipelineGraph): readonly (readonly string[])[] {
  assertAcyclic(graph);

  const depth = new Map<string, number>();

  const depthOf = (name: string): number => {
    const cached = depth.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const node = requireNode(graph, name);
    const value =
      node.dependencies.length === 0
        ? 0
        : Math.max(...node.dependencies.map((dependency) => depthOf(dependency) + 1));
    depth.set(name, value);
    return value;
  };

  const layers: string[][] = [];
  for (const name of [...graph.nodes.keys()].sort()) {
    const level = depthOf(name);
    while (layers.length <= level) {
      layers.push([]);
    }
    (layers[level] as string[]).push(name);
  }

  return layers;
}
