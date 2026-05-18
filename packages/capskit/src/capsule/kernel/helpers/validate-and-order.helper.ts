import { CapsuleDefinition } from '../types/capsule-definition.type';
import { validateDepGraph } from '../rules/validate-deps-graph.rule';
import { detectCycle } from '../rules/detect-cycle.rule';
import { topologicalSort } from './topological-sort.helper';

export function validateAndOrder(capsules: Map<string, { def: CapsuleDefinition; dir?: string }>): CapsuleDefinition[] {
  const allDefs = Array.from(capsules.values()).map(v => v.def);

  const depValidation = validateDepGraph(allDefs);
  if (!depValidation.valid) {
    throw new Error(`Dependency validation failed: ${depValidation.errors.join(', ')}`);
  }

  const cycleError = detectCycle(allDefs);
  if (cycleError) {
    throw cycleError;
  }

  return topologicalSort(allDefs);
}
