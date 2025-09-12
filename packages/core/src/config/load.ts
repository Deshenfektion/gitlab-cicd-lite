import type { PipelineGraph } from '../graph/dag.js';
import { validatePipeline } from '../graph/validate.js';
import { normalizeConfig } from './normalize.js';
import { parseConfig } from './parse.js';
import type { PipelineDefinition } from './types.js';

export interface LoadedPipeline {
  readonly definition: PipelineDefinition;
  readonly graph: PipelineGraph;
}

export function loadPipeline(source: string): LoadedPipeline {
  const definition = normalizeConfig(parseConfig(source));
  const graph = validatePipeline(definition);
  return { definition, graph };
}
