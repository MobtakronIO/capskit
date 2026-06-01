import { CapsuleDefinition } from '../kernel/types/capsule-definition.type';
import { KernelDeps } from '../kernel/types/cap-input.type';
import { buildSubscriptionMap } from './helpers/build-subscription-map.helper';
import emitCap, { meta as emitMeta } from './caps/emit.cap';
import subscribeCap, { meta as subscribeMeta } from './caps/subscribe.cap';
import unsubscribeCap, { meta as unsubscribeMeta } from './caps/unsubscribe.cap';
import listSubscriptionsCap, { meta as listSubscriptionsMeta } from './caps/list-subscriptions.cap';

export default {
  name: 'events',
  dependencies: [],
  caps: [
    { meta: emitMeta, handler: emitCap },
    { meta: subscribeMeta, handler: subscribeCap },
    { meta: unsubscribeMeta, handler: unsubscribeCap },
    { meta: listSubscriptionsMeta, handler: listSubscriptionsCap },
  ],
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
