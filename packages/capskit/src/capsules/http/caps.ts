import type { CapsuleRegistry, CapMeta } from '../../kernel/cap-loader';

export class BuildRouterCap {
  async buildRouter(payload: any, context: any): Promise<{ router: any }> {
    const { adapter = 'elysia', traitHandlers = {} } = payload?.body || payload || {};
    const capskit = context.deps.capskit;

    let adapterFn = adapter;
    if (typeof adapter === 'string') {
      if (adapter === 'elysia') {
        try {
          const mod = await import('@mobtakronio/elysia');
          adapterFn = mod.createElysiaAdapter || mod.default || mod;
        } catch (err: any) {
          throw new Error(`Failed to load elysia adapter: ${err.message}`);
        }
      }
    }

    if (typeof adapterFn === 'function') {
      return { router: await adapterFn(capskit, { http: true, traitHandlers }) };
    }
    throw new Error(`Unsupported HTTP adapter: ${typeof adapterFn}`);
  }
}

const buildRouterMeta: CapMeta = {
  name: 'buildRouter',
  dependencies: ['capskit'],
  actions: {
    buildRouter: {
      description: 'Returns an Elysia Router containing all platform capabilities mapped to HTTP endpoints',
    },
  },
};

const registry: CapsuleRegistry = {
  name: 'http',
  caps: [
    { class: BuildRouterCap, meta: buildRouterMeta },
  ],
};

export default registry;
