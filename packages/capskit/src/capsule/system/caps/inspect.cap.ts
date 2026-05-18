import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

export const meta: CapMeta = {
  name: 'inspect',
  kind: 'action',
  routes: [{ method: 'GET', path: '/inspect', cap: 'inspect', action: 'inspect' }],
};

export default async function inspect(input: CapInput, ctx: CapContext) {
  const capsules = ctx.deps.capsules;
  const caps = ctx.deps.capsMap;
  const allCaps = ctx.deps.allCaps;

  const capsuleList: { name: string; dependencies: string[] }[] = [];
  for (const [, value] of capsules) {
    capsuleList.push({
      name: value.def.name,
      dependencies: value.def.dependencies || [],
    });
  }

  const capList: { capPath: string; capsule: string; kind: string; hooks: { pre: string[]; post: string[] } }[] = [];
  for (const [path, value] of caps) {
    capList.push({
      capPath: path,
      capsule: value.capsuleName,
      kind: value.meta.kind,
      hooks: Array.isArray(value.meta.hooks) 
        ? { pre: value.meta.hooks, post: [] } 
        : { pre: value.meta.hooks?.pre || [], post: value.meta.hooks?.post || [] },
    });
  }

  const hooks = Array.from(allCaps.values())
    .filter(c => c.meta.kind === 'hook')
    .map(c => c.meta.name);

  return {
    capsules: capsuleList,
    caps: capList,
    hooks,
    totalCapsules: capsuleList.length,
    totalCaps: capList.length,
    totalHooks: hooks.length,
  };
}
