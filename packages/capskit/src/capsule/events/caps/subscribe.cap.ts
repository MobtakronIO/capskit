import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

export const meta: CapMeta = {
  name: 'subscribe',
  kind: 'action',
};

export default async function subscribe(input: CapInput, ctx: CapContext) {
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
    eventsState.wildcardSubscribers.push({ pattern: event, capPath });
  } else {
    const entries = eventsState.subscriptions.get(event) || [];
    entries.push({ capPath });
    eventsState.subscriptions.set(event, entries);
  }

  return { subscribed: true, event, capPath };
}
