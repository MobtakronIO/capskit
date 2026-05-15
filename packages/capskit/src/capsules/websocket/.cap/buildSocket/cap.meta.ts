import { CapMeta } from '../../../../types';

/**
 * Metadata for the buildSocket cap.
 *
 * This cap dynamically generates WebSocket configurations by introspecting
 * all registered capsules' route definitions (via the adapter).  There are
 * no hardcoded socket definitions here — the adapter produces the final
 * socket table at runtime based on each capsule's CapMeta.routes declarations.
 */
export const meta: CapMeta = {
  name: 'buildSocket',
  dependencies: ['capskit'],
  actions: {
    buildSocket: {
      description:
        'Returns a WebSocket configuration containing all platform capabilities mapped to WebSockets',
    },
  },
};
