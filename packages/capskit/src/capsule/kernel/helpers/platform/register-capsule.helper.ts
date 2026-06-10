import { CapsuleDefinition, PreBuiltCap } from '../../types/capsule-definition.type';
import { InternalState, CapFile } from '../../types/platform.types';

export function registerCapsule(
  state: InternalState,
  preRegisteredCapsules: CapsuleDefinition[],
  capsuleDef: CapsuleDefinition,
  caps?: PreBuiltCap[]
): void {
  if (state.capsules.has(capsuleDef.name)) {
    throw new Error(`Capsule "${capsuleDef.name}" is already registered`);
  }

  preRegisteredCapsules.push(capsuleDef);
  state.capsules.set(capsuleDef.name, { def: capsuleDef, dir: `virtual://${capsuleDef.name}` });

  // Auto-derive caps from capsuleDef.caps when not explicitly provided
  const resolvedCaps = caps || (capsuleDef.caps?.map(c => ({
    meta: c.meta,
    handler: c.handler,
    filePath: `virtual://${capsuleDef.name}/${c.meta.name}`,
  })) || []);

  for (const cap of resolvedCaps) {
    const capPath = `${capsuleDef.name}.${cap.meta.name}`;
    const capFile: CapFile = {
      meta: cap.meta,
      handler: cap.handler,
      capsuleName: capsuleDef.name,
      filePath: cap.filePath || `virtual://${capsuleDef.name}/${cap.meta.name}`,
    };
    state.caps.set(capPath, capFile);
    state.allCaps.set(capPath, capFile);
  }
}
