import { requireNode, type PipelineGraph } from './dag.js';

function collect(start: string, edges: (name: string) => readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue = [...edges(start)];

  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    queue.push(...edges(name));
  }

  seen.delete(start);
  return seen;
}

export function descendants(graph: PipelineGraph, name: string): ReadonlySet<string> {
  return collect(name, (current) => requireNode(graph, current).dependents);
}

export function ancestors(graph: PipelineGraph, name: string): ReadonlySet<string> {
  return collect(name, (current) => requireNode(graph, current).dependencies);
}

export function artifactSources(graph: PipelineGraph, name: string): readonly string[] {
  return requireNode(graph, name).dependencies.filter(
    (dependency) => requireNode(graph, dependency).job.artifacts !== null,
  );
}
