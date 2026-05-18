import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';
import { compileRoutes } from '../helpers/compile-routes.helper';

export const meta: CapMeta = {
  name: 'build-router',
  kind: 'action',
};

export default async function buildRouter(input: CapInput, ctx: CapContext) {
  const allCaps = Array.from(ctx.deps.allCaps.values()).map(entry => ({
    capsuleName: entry.capsuleName,
    meta: entry.meta,
  }));

  const result = compileRoutes(allCaps);

  return result;
}
