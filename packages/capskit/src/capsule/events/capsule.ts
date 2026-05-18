import { CapsuleDefinition } from '../kernel/types/capsule-definition.type';
import { KernelDeps, EventsState } from '../kernel/types/cap-input.type';

export default {
  name: 'events',
  dependencies: [],
  boot: {
    init: async ({ deps }: { deps: KernelDeps }) => {
      deps.eventsState = {
        subscriptions: new Map(),
        wildcardSubscribers: [],
      };
    },
  },
} satisfies CapsuleDefinition;
