import { CapMeta } from '../../types';

/**
 * Metadata for the boot cap.
 *
 * The boot cap orchestrates capsule initialization in dependency order:
 * builds a dependency graph, topologically sorts capsules, and boots
 * them sequentially with readiness signaling.
 */
export const meta: CapMeta = {
  name: 'boot',
  actions: {
    buildGraph: {
      description:
        'Build a dependency graph from capsule manifests. Returns boot order, roots, and leaves.',
    },
    validateManifests: {
      description:
        'Validate that a set of manifests can be booted together. Checks for cycles and missing dependencies.',
    },
    boot: {
      description:
        'Boot capsules in topological dependency order. Waits for each capsule to signal readiness.',
    },
  },
};
