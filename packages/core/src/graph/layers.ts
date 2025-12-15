export interface Edge {
  readonly from: string;
  readonly to: string;
}

export function layersFromEdges(
  nodes: readonly string[],
  edges: readonly Edge[],
): readonly (readonly string[])[] {
  const known = new Set(nodes);
  const dependencies = new Map<string, string[]>(nodes.map((node) => [node, []]));

  for (const edge of edges) {
    if (known.has(edge.from) && known.has(edge.to)) {
      (dependencies.get(edge.to) as string[]).push(edge.from);
    }
  }

  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (node: string): number => {
    const cached = depth.get(node);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(node)) {
      return 0;
    }

    visiting.add(node);
    const upstream = dependencies.get(node) as string[];
    const value =
      upstream.length === 0 ? 0 : Math.max(...upstream.map((parent) => depthOf(parent) + 1));
    visiting.delete(node);

    depth.set(node, value);
    return value;
  };

  const layers: string[][] = [];

  for (const node of [...nodes].sort()) {
    const level = depthOf(node);
    while (layers.length <= level) {
      layers.push([]);
    }
    (layers[level] as string[]).push(node);
  }

  return layers;
}
