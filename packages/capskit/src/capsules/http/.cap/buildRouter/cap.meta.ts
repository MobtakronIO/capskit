import { CapMeta } from '../../../../types';

/**
 * Metadata for the buildRouter cap.
 *
 * This cap dynamically generates HTTP routes by introspecting
 * all registered capsules' route definitions (via the adapter).
 * There are no hardcoded route definitions here — the adapter
 * produces the final route table at runtime based on each
 * capsule's CapMeta.routes declarations.
 */
export const meta: CapMeta = {
  name: 'buildRouter',
  dependencies: ['capskit'],
  actions: {
    buildRouter: {
      description:
        'Returns an Elysia Router containing all platform capabilities mapped to HTTP',
    },
  },
};
