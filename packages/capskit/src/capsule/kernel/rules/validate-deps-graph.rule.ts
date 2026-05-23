import { CapsuleDefinition } from '../types/capsule-definition.type';

export function validateDepGraph(capsules: CapsuleDefinition[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const names = new Set(capsules.map(c => c.name));

  for (const capsule of capsules) {
    for (const dep of (capsule.dependencies || [])) {
      if (dep === 'capskit') continue;
      if (!names.has(dep)) {
        errors.push(`Capsule "${capsule.name}" depends on "${dep}" which is not registered`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
