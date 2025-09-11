import { ConfigError, type ConfigIssue } from '../config/errors.js';
import type { PipelineDefinition } from '../config/types.js';
import { findCycle } from './cycles.js';
import { buildGraph, type PipelineGraph } from './dag.js';

function checkStageOrder(definition: PipelineDefinition): ConfigIssue[] {
  const stageIndex = new Map(definition.stages.map((stage, index) => [stage, index]));
  const stageOf = new Map(definition.jobs.map((job) => [job.name, job.stage]));
  const issues: ConfigIssue[] = [];

  for (const job of definition.jobs) {
    const own = stageIndex.get(job.stage) as number;
    for (const need of job.needs) {
      const upstream = stageOf.get(need);
      if (upstream === undefined) {
        continue;
      }
      if ((stageIndex.get(upstream) as number) > own) {
        issues.push({
          path: `jobs.${job.name}.needs`,
          message: `"${need}" runs in the later stage "${upstream}"`,
        });
      }
    }
  }

  return issues;
}

export function validatePipeline(definition: PipelineDefinition): PipelineGraph {
  const graph = buildGraph(definition);
  const issues = checkStageOrder(definition);

  const cycle = findCycle(graph);
  if (cycle !== null) {
    issues.push({
      path: 'jobs',
      message: `dependency cycle detected: ${[...cycle].reverse().join(' -> ')}`,
    });
  }

  if (issues.length > 0) {
    throw new ConfigError(`Invalid pipeline (${issues.length} issue(s))`, issues);
  }

  return graph;
}
