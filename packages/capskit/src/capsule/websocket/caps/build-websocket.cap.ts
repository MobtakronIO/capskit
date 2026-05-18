import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';
import { compileEndpoints } from '../helpers/compile-endpoints.helper';

export const meta: CapMeta = {
  name: 'build-websocket',
  kind: 'action',
};

export default async function buildWebSocket(input: CapInput, ctx: CapContext) {
  const allCaps = Array.from(ctx.deps.allCaps.values()).map(entry => ({
    capsuleName: entry.capsuleName,
    meta: entry.meta,
  }));

  const result = compileEndpoints(allCaps);

  return result;
}
