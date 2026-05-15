import { CapMeta } from '../../types';

/**
 * Metadata for the inspect cap.
 *
 * Provides introspection into the kernel runtime: listing actions,
 * examining manifests, and inspecting state.
 */
export const meta: CapMeta = {
  name: 'inspect',
  actions: {
    listActions: {
      description:
        'List all registered actions across capsules, optionally filtered by capsule name.',
    },
    listManifests: {
      description:
        'List all registered capsule manifests with their actions and dependencies.',
    },
    getState: {
      description:
        'Return a snapshot of kernel runtime state (actions, manifests, events, dependencies).',
    },
  },
};
