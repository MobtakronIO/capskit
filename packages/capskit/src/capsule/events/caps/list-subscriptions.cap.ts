import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

export const meta: CapMeta = {
  name: 'list-subscriptions',
};

export default async function listSubscriptions(input: CapInput, ctx: CapContext) {
  const eventsState = ctx.deps.eventsState;
  if (!eventsState) {
    throw new Error('Events state not initialized');
  }

  const subscriptions: Record<string, string[]> = {};
  for (const [event, entries] of eventsState.subscriptions) {
    subscriptions[event] = entries.map(e => e.capPath);
  }

  return {
    subscriptions,
    wildcardSubscribers: eventsState.wildcardSubscribers,
    totalSubscribers: Object.values(subscriptions).flat().length + eventsState.wildcardSubscribers.length,
  };
}
