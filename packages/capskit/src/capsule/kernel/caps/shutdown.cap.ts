import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';

export const meta: CapMeta = {
  name: 'shutdown',
  kind: 'action',
};

export default async function shutdown(input: CapInput, ctx: CapContext) {
  const capsules = ctx.deps.capsules;

  const capsuleDefs = Array.from(capsules.values()).map(v => v.def);
  const reverseOrder = [...capsuleDefs].reverse();

  for (const capsuleDef of reverseOrder) {
    if (capsuleDef.boot?.shutdown) {
      try {
        await capsuleDef.boot.shutdown({ deps: ctx.deps });
      } catch (e) {
        console.error(`Error shutting down capsule "${capsuleDef.name}":`, e);
      }
    }
  }

  return { status: 'shutdown' };
}
