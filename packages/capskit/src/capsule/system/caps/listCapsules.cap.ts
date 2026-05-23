import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

export const meta: CapMeta = {
  name: 'listCapsules',
  routes: [{ method: 'GET', path: '/capsules', cap: 'listCapsules', action: 'listCapsules' }],
};

export default async function listCapsules(input: CapInput, ctx: CapContext) {
  const capskit = ctx.deps.capskit as any;
  if (!capskit || typeof capskit.getManifests !== 'function') {
    throw new Error(
      'System capsule requires "capskit" dependency with getManifests() method.',
    );
  }
  return capskit.getManifests();
}
