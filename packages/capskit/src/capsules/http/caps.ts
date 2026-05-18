import type { CapsuleRegistry, CapMeta } from '../../kernel/cap-loader';

export class BuildRouterCap {
  async buildRouter(payload: any, context: any): Promise<{ router: any }> {
    const { adapter = 'elysia', traitHandlers = {} } = payload?.body || payload || {};
    const capskit = context.deps.capskit;

    if (typeof adapter === 'function') {
      return { router: await adapter(capskit, { traitHandlers }) };
    }
    throw new Error(`Unsupported HTTP adapter: ${typeof adapter}`);
  }
}

const buildRouterMeta: CapMeta = {
  name: 'buildRouter',
  kind: 'action',
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
