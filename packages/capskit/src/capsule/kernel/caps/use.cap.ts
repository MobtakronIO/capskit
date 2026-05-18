import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';

export const meta: CapMeta = {
  name: 'use',
  kind: 'action',
};

/**
 * Returns a proxy object that allows calling any cap in a capsule
 * via dot notation: capskit.use('orders').createOrder({ body: {...} })
 */
export default async function use(input: CapInput, ctx: CapContext) {
  const { capsuleName } = input.body || {};

  if (!capsuleName) {
    throw new Error('capsuleName is required');
  }

  const invoke = ctx.invoke;

  // Create a proxy that resolves cap method calls
  const proxy = new Proxy({}, {
    get(_target, prop: string) {
      return async (payload: unknown) => {
        const capPath = `${capsuleName}.${prop}`;
        return invoke(capPath, payload);
      };
    },
  });

  return proxy;
}
