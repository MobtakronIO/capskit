// Types
export * from './types/event.type';
export * from './types/subscription.type';
export * from './types/event-bus.type';

// Errors
export * from './errors';

// Constants
export * from './constants';

// Rules
export { isValidEventName } from './rules/is-valid-event.rule';

// Helpers
export { matchEventPattern } from './helpers/match-event-pattern.helper';
export { buildSubscriptionMap } from './helpers/build-subscription-map.helper';

// Capsule definition
export { default as eventsCapsuleDef } from './capsule';

// Caps
export { default as emitCap } from './caps/emit.cap';
export { default as subscribeCap } from './caps/subscribe.cap';
export { default as unsubscribeCap } from './caps/unsubscribe.cap';
export { default as listSubscriptionsCap } from './caps/list-subscriptions.cap';
export { meta as emitCapMeta } from './caps/emit.cap';
export { meta as subscribeCapMeta } from './caps/subscribe.cap';
export { meta as unsubscribeCapMeta } from './caps/unsubscribe.cap';
export { meta as listSubscriptionsCapMeta } from './caps/list-subscriptions.cap';

// EventBus factory
import type { EventBus, EventSubscriber } from './types/event-bus.type';
import { matchEventPattern } from './helpers/match-event-pattern.helper';

export function createEventBus(): EventBus {
  const subscribers = new Map<string, EventSubscriber>();

  return {
    emit(event: string, data: unknown) {
      for (const sub of subscribers.values()) {
        for (const pattern of sub.patterns) {
          const matched = matchEventPattern(pattern, event);
          if (matched) {
            try {
              sub.onEvent(event, data, pattern);
            } catch (err) {
              console.error('[EventBus] Error in onEvent callback:', err);
            }
            break;
          }
        }
      }
    },
    dispatch(event: string, data: unknown) {
      this.emit(event, data);
    },
    subscribe(sub: EventSubscriber, patterns: string[]) {
      subscribers.set(sub.id, { ...sub, patterns });
    },
    unsubscribe(id: string) {
      subscribers.delete(id);
    },
  };
}

