import { CapsuleDefinition } from '../kernel/types/capsule-definition.type';
import { KernelDeps } from '../kernel/types/cap-input.type';
import { buildSubscriptionMap } from './helpers/build-subscription-map.helper';

export default {
  name: 'events',
  dependencies: [],
  boot: {
    init: async ({ deps }: { deps: KernelDeps }) => {
      const allCaps = Array.from(deps.allCaps.values()).map(entry => ({
        capsuleName: entry.capsuleName,
        meta: entry.meta,
      }));
      const { subscriptions, wildcardSubscribers } = buildSubscriptionMap(allCaps);
      deps.eventsState = {
        subscriptions,
        wildcardSubscribers,
      };
    },
  },
} satisfies CapsuleDefinition;
