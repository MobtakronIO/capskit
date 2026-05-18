import { CapMeta } from '../../kernel/types/cap-meta.type';
import { SubscriptionMap, WildcardSubscribers } from '../types/subscription.type';

/**
 * Build subscription maps from loaded capsule metadata.
 * Scans all cap metas for events.subscribes declarations.
 */
export function buildSubscriptionMap(
  allCaps: { capsuleName: string; meta: CapMeta }[],
): { subscriptions: SubscriptionMap; wildcardSubscribers: WildcardSubscribers } {
  const subscriptions: SubscriptionMap = new Map();
  const wildcardSubscribers: WildcardSubscribers = [];

  for (const cap of allCaps) {
    if (cap.meta.events?.subscribes) {
      for (const sub of cap.meta.events.subscribes) {
        const capPath = `${cap.capsuleName}.${cap.meta.name}`;
        if (sub.event.includes('*')) {
          wildcardSubscribers.push({ pattern: sub.event, capPath });
        } else {
          const entries = subscriptions.get(sub.event) || [];
          entries.push({ capPath });
          subscriptions.set(sub.event, entries);
        }
      }
    }
  }

  return { subscriptions, wildcardSubscribers };
}
