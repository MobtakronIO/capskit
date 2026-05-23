import { CapsuleDefinition } from '../types/capsule-definition.type';

/**
 * Topological sort of capsules by dependency order.
 * Returns ordered array of capsule definitions (dependencies first).
 */
export function topologicalSort(capsules: CapsuleDefinition[]): CapsuleDefinition[] {
  const inDegree = new Map<string, number>();
  const byName = new Map<string, CapsuleDefinition>();

  for (const c of capsules) {
    const deps = (c.dependencies || []).filter(d => d !== 'capskit');
    inDegree.set(c.name, deps.length);
    byName.set(c.name, c);
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const result: CapsuleDefinition[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    result.push(byName.get(name)!);

    // Find all capsules that depend on this one
    for (const c of capsules) {
      const deps = (c.dependencies || []).filter(d => d !== 'capskit');
      if (deps.includes(name)) {
        const newDegree = inDegree.get(c.name)! - 1;
        inDegree.set(c.name, newDegree);
        if (newDegree === 0) queue.push(c.name);
      }
    }
  }

  if (result.length !== capsules.length) {
    throw new Error('Circular dependency detected — topological sort failed');
  }

  return result;
}
