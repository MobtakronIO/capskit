import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';
import { discoverCaps } from '../helpers/discover-caps.helper';
import { validateCapMeta } from '../rules/validate-cap-meta.rule';
import { CapsuleDefinition } from '../types/capsule-definition.type';

export const meta: CapMeta = {
  name: 'register',
  kind: 'action',
};

export default async function registerCapsule(input: CapInput, ctx: CapContext) {
  const body = input.body as { capsuleDef?: CapsuleDefinition; capsuleDir?: string } || {};
  const { capsuleDef, capsuleDir } = body;

  if (!capsuleDef || !capsuleDef.name) {
    throw new Error('capsuleDef with name is required');
  }

  const capsules = ctx.deps.capsules;
  const caps = ctx.deps.capsMap;
  const allCaps = ctx.deps.allCaps;

  if (capsules.has(capsuleDef.name)) {
    throw new Error(`Capsule "${capsuleDef.name}" is already registered`);
  }

  if (!validateCapMeta({ name: capsuleDef.name, kind: 'action' })) {
    throw new Error(`Invalid capsule name: "${capsuleDef.name}"`);
  }

  capsules.set(capsuleDef.name, { def: capsuleDef, dir: capsuleDir });

  if (capsuleDir) {
    const discovered = await discoverCaps(capsuleDir, capsuleDef.name);
    for (const cap of discovered) {
      const capPath = `${cap.capsuleName}.${cap.meta.name}`;
      caps.set(capPath, cap);
      allCaps.set(cap.meta.name, cap);
    }
  }

  if (capsuleDef.boot?.init) {
    await capsuleDef.boot.init({ deps: ctx.deps });
  }

  return { registered: capsuleDef.name };
}
