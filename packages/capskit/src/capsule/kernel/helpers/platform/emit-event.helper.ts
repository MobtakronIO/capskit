import { InternalState } from '../../types/platform.types';
import { buildContext } from '../build-context.helper';

export function emitEvent(state: InternalState, event: string, data: unknown): void {
  const emitCap = state.caps.get('events.emit');
  if (emitCap) {
    const ctx = buildContext(state);
    emitCap.handler({ body: { event, data } }, ctx);
  } else {
    const eventBus = state.dependencies.eventBus;
    if (eventBus) {
      eventBus.dispatch(event, data);
    }
  }
}
