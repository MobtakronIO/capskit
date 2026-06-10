import type { CapsuleRegistry, CapMeta } from '../../capsule/kernel';

export class WebSocketCap {
  async buildSocket(payload: any, _context: any) {
    const { adapter = 'elysia' } = payload?.body || payload || {};
    return {
      sockets: {
        default: {
          adapter,
          path: '/ws',
        },
      },
    };
  }
}

const wsMeta: CapMeta = {
  name: 'buildSocket',
  dependencies: ['capskit'],
  actions: {
    buildSocket: { description: 'Builds WebSocket configuration for the specified adapter' },
  },
};

const registry: CapsuleRegistry = {
  name: 'websocket',
  caps: [
    { class: WebSocketCap, meta: wsMeta },
  ],
};

export default registry;
