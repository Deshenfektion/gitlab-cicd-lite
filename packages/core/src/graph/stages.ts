import type { PipelineDefinition } from '../config/types.js';

export function groupByStage(definition: PipelineDefinition): Map<string, string[]> {
  const grouped = new Map<string, string[]>(definition.stages.map((stage) => [stage, []]));
  for (const job of definition.jobs) {
    (grouped.get(job.stage) as string[]).push(job.name);
  }
  return grouped;
}

export function resolveDependencies(definition: PipelineDefinition): Map<string, string[]> {
  const byStage = groupByStage(definition);
  const populatedStages = definition.stages.filter(
    (stage) => (byStage.get(stage) as string[]).length > 0,
  );

  const previousStageOf = new Map<string, string | null>();
  let previous: string | null = null;
  for (const stage of populatedStages) {
    previousStageOf.set(stage, previous);
    previous = stage;
  }

  const resolved = new Map<string, string[]>();
  for (const job of definition.jobs) {
    if (job.needs.length > 0) {
      resolved.set(job.name, [...job.needs]);
      continue;
    }
    const previousStage = previousStageOf.get(job.stage) ?? null;
    resolved.set(
      job.name,
      previousStage === null ? [] : [...(byStage.get(previousStage) as string[])],
    );
  }

  return resolved;
}
