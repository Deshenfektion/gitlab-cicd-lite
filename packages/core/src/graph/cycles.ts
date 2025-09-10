import { ConfigError } from '../config/errors.js';
import { requireNode, type PipelineGraph } from './dag.js';

type Mark = 'visiting' | 'done';

export function findCycle(graph: PipelineGraph): readonly string[] | null {
  const marks = new Map<string, Mark>();
  const stack: string[] = [];

  const visit = (name: string): readonly string[] | null => {
    const mark = marks.get(name);
    if (mark === 'done') {
      return null;
    }
    if (mark === 'visiting') {
      const start = stack.indexOf(name);
      return [...stack.slice(start), name];
    }

    marks.set(name, 'visiting');
    stack.push(name);

    for (const dependency of requireNode(graph, name).dependencies) {
      const cycle = visit(dependency);
      if (cycle !== null) {
        return cycle;
      }
    }

    stack.pop();
    marks.set(name, 'done');
    return null;
  };

  for (const name of graph.nodes.keys()) {
    const cycle = visit(name);
    if (cycle !== null) {
      return cycle;
    }
  }

  return null;
}

export function assertAcyclic(graph: PipelineGraph): void {
  const cycle = findCycle(graph);
  if (cycle !== null) {
    throw ConfigError.of('jobs', `dependency cycle detected: ${[...cycle].reverse().join(' -> ')}`);
  }
}
