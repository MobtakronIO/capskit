import { CapsuleDefinition } from '../types/capsule-definition.type';
import { CycleError } from '../errors';

export function detectCycle(capsules: CapsuleDefinition[]): CycleError | null {
  const graph = new Map<string, string[]>();
  for (const c of capsules) {
    graph.set(c.name, c.dependencies || []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(name: string): CycleError | null {
    if (inStack.has(name)) {
      const cycleStart = path.indexOf(name);
      const cycle = [...path.slice(cycleStart), name];
      return new CycleError(`Circular dependency detected: ${cycle.join(' → ')}`, cycle);
    }
    if (visited.has(name)) return null;

    visited.add(name);
    inStack.add(name);
    path.push(name);

    for (const dep of graph.get(name) || []) {
      const result = dfs(dep);
      if (result) return result;
    }

    path.pop();
    inStack.delete(name);
    return null;
  }

  for (const c of capsules) {
    const result = dfs(c.name);
    if (result) return result;
  }

  return null;
}
