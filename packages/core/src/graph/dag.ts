import { ConfigError } from '../config/errors.js';
import type { JobDefinition, PipelineDefinition } from '../config/types.js';

export interface GraphNode {
  readonly name: string;
  readonly job: JobDefinition;
  readonly dependencies: readonly string[];
  readonly dependents: readonly string[];
}

export interface PipelineGraph {
  readonly nodes: ReadonlyMap<string, GraphNode>;
}

export function buildGraph(definition: PipelineDefinition): PipelineGraph {
  const jobs = new Map(definition.jobs.map((job) => [job.name, job]));
  const dependents = new Map<string, string[]>(definition.jobs.map((job) => [job.name, []]));

  for (const job of definition.jobs) {
    for (const need of job.needs) {
      if (!jobs.has(need)) {
        throw ConfigError.of(`jobs.${job.name}.needs`, `unknown job "${need}"`);
      }
      (dependents.get(need) as string[]).push(job.name);
    }
  }

  const nodes = new Map<string, GraphNode>();
  for (const job of definition.jobs) {
    nodes.set(job.name, {
      name: job.name,
      job,
      dependencies: [...job.needs],
      dependents: dependents.get(job.name) as string[],
    });
  }

  return { nodes };
}

export function requireNode(graph: PipelineGraph, name: string): GraphNode {
  const node = graph.nodes.get(name);
  if (node === undefined) {
    throw new Error(`Unknown job "${name}"`);
  }
  return node;
}
