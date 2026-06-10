import { CapsuleDefinition } from '../../types/capsule-definition.type';
import { BootState } from '../boot-helpers.helper';
import { BUILTIN_CAPSULES } from '../../constants';

import kernelCapsule from '../../../kernel/capsule';
import eventsCapsule from '../../../events/capsule';
import httpCapsule from '../../../http/capsule';
import websocketCapsule from '../../../websocket/capsule';
import systemCapsule from '../../../system/capsule';

const BUILTIN_CAPSULES_MAP: Record<string, any> = {
  kernel: kernelCapsule,
  events: eventsCapsule,
  http: httpCapsule,
  websocket: websocketCapsule,
  system: systemCapsule,
};

async function loadBuiltinCapsule(name: string, state: BootState) {
  const capsuleDef = BUILTIN_CAPSULES_MAP[name] as CapsuleDefinition | undefined;
  if (!capsuleDef) {
    console.warn(`Built-in capsule "${name}" not found in static registry`);
    return;
  }

  const capsuleDir = `virtual://${name}`;
  state.capsules.set(capsuleDef.name, { def: capsuleDef, dir: capsuleDir });

  if (capsuleDef.caps) {
    for (const cap of capsuleDef.caps) {
      const capPath = `${capsuleDef.name}.${cap.meta.name}`;
      state.caps.set(capPath, {
        meta: cap.meta,
        handler: cap.handler,
        capsuleName: capsuleDef.name,
        filePath: `virtual://${capsuleDef.name}/${cap.meta.name}`,
        capsuleDef,
      });
    }
  }
}

export async function loadBuiltinCapsules(disableBuiltins: string[], state: BootState): Promise<void> {
  const enabledBuiltins = BUILTIN_CAPSULES.filter(b => !disableBuiltins.includes(b));
  for (const builtinName of enabledBuiltins) {
    await loadBuiltinCapsule(builtinName, state);
  }
}