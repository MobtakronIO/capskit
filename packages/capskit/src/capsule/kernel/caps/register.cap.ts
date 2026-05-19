import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';
import { discoverCaps } from '../helpers/discover-caps.helper';
import { validateCapMeta } from '../rules/validate-cap-meta.rule';
import { CapsuleDefinition, CapFile } from '../types/capsule-definition.type';

export const meta: CapMeta = {
  name: 'register',
  kind: 'action',
};

export default async function registerCapsule(input: CapInput, ctx: CapContext) {
  const body = input.body as {
    capsuleDef?: CapsuleDefinition;
    capsuleDir?: string;
    /** Pre-discovered caps for capsules that don't live on the filesystem (e.g. @mobtakronio/capskit-drizzle) */
    caps?: Array<Omit<CapFile, 'capsuleName'> & { capsuleName?: string }>;
  } || {};
  const { capsuleDef, capsuleDir, caps } = body;

  if (!capsuleDef || !capsuleDef.name) {
    throw new Error('capsuleDef with name is required');
  }

  const capsules = ctx.deps.capsules;
  const capsMap = ctx.deps.capsMap;
  const allCaps = ctx.deps.allCaps;

  if (capsules.has(capsuleDef.name)) {
    throw new Error(`Capsule "${capsuleDef.name}" is already registered`);
  }

  if (!validateCapMeta({ name: capsuleDef.name, kind: 'action' })) {
    throw new Error(`Invalid capsule name: "${capsuleDef.name}"`);
  }

  capsules.set(capsuleDef.name, { def: capsuleDef, dir: capsuleDir });

  // Option A: caps provided directly (pre-built capsules like @mobtakronio/capskit-drizzle)
  if (caps && caps.length > 0) {
    for (const cap of caps) {
      const capsuleName = cap.capsuleName || capsuleDef.name;
      const capPath = `${capsuleName}.${cap.meta.name}`;
      const capFile: CapFile = {
        meta: cap.meta,
        handler: cap.handler,
        capsuleName,
        filePath: cap.filePath || `virtual://${capsuleName}/${cap.meta.name}`,
      };
      capsMap.set(capPath, capFile);
      allCaps.set(capPath, capFile);
    }
  }

  // Option B: discover caps from a filesystem directory
  if (capsuleDir) {
    const discovered = await discoverCaps(capsuleDir, capsuleDef.name);
    for (const cap of discovered) {
      const capPath = `${cap.capsuleName}.${cap.meta.name}`;
      capsMap.set(capPath, cap);
      allCaps.set(capPath, cap);
    }
  }

  if (capsuleDef.boot?.init) {
    await capsuleDef.boot.init({ deps: ctx.deps });
  }

  return { registered: capsuleDef.name, capCount: caps ? caps.length : 0 };
}
