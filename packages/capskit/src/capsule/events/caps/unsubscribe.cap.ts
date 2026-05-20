import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

export const meta: CapMeta = {
  name: 'unsubscribe',
};

export default async function unsubscribe(input: CapInput, ctx: CapContext) {
  const body = input.body || {};
  const event = body.event as string | undefined;
  const capPath = body.capPath as string | undefined;

  if (!event || !capPath) {
    throw new Error('event and capPath are required');
  }

  const eventsState = ctx.deps.eventsState;
  if (!eventsState) {
    throw new Error('Events state not initialized');
  }

  if (event.includes('*')) {
    const idx = eventsState.wildcardSubscribers.findIndex(
      sub => sub.pattern === event && sub.capPath === capPath
    );
    if (idx === -1) return { unsubscribed: false, reason: 'subscription not found' };
    eventsState.wildcardSubscribers.splice(idx, 1);
  } else {
    const entries = eventsState.subscriptions.get(event) || [];
    const filtered = entries.filter(e => e.capPath !== capPath);
    if (filtered.length === entries.length) {
      return { unsubscribed: false, reason: 'subscription not found' };
    }
    eventsState.subscriptions.set(event, filtered);
  }

  return { unsubscribed: true, event, capPath };
}
