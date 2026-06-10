import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';
import { matchEventPattern } from '../helpers/match-event-pattern.helper';
import { isValidEventName } from '../rules/is-valid-event.rule';

export const meta: CapMeta = {
  name: 'emit',
};

export default async function emit(input: CapInput, ctx: CapContext) {
  const body = input.body || {};
  const event = body.event as string | undefined;
  const data = body.data;

  if (!event) {
    throw new Error('event name is required');
  }

  if (!isValidEventName(event)) {
    throw new Error(`Invalid event name: "${event}"`);
  }

  const eventsState = ctx.deps.eventsState;
  if (!eventsState) {
    throw new Error('Events state not initialized');
  }

  const exactSubs = eventsState.subscriptions.get(event) || [];
  const wildcardSubs = eventsState.wildcardSubscribers.filter(sub =>
    matchEventPattern(sub.pattern, event)
  );

  const allSubs = [
    ...exactSubs,
    ...wildcardSubs.map(w => ({ capPath: w.capPath })),
  ];

  const results: { capPath: string; success: boolean; error?: string }[] = [];

  for (const sub of allSubs) {
    try {
      await ctx.call(sub.capPath, { body: data });
      results.push({ capPath: sub.capPath, success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ capPath: sub.capPath, success: false, error: errorMsg });
      try {
        await ctx.call('events.handle-dead-letter', {
          body: { event, data, capPath: sub.capPath, error: errorMsg },
        });
      } catch {
        console.error(`Dead letter handler failed for ${event} → ${sub.capPath}`);
      }
    }
  }

  // Also dispatch to adapter eventBus (WebSocket clients)
  const adapterEventBus = ctx.deps.eventBus;
  if (adapterEventBus) {
    adapterEventBus.dispatch(event, data);
  }

  return { event, subscriberCount: allSubs.length, results };
}
