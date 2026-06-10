import { CapsuleDefinition, CapFile } from './capsule-definition.type';
import { EventsState } from './cap-input.type';
import type { EventBus } from '../../events/types/event-bus.type';

export interface CapsKitInstance {
  call: (capPath: string, payload?: unknown, options?: unknown) => Promise<unknown>;
  use: (capsuleName: string) => unknown;
  emit: (event: string, data: unknown) => void;
  start: () => Promise<{ status: string; capsuleCount: number; capCount: number }>;
  shutdown: () => Promise<{ status: string }>;
  describe: () => { capsules: string[]; caps: string[]; dependencies: string[] };
}

export interface InternalState {
  capsules: Map<string, { def: CapsuleDefinition; dir: string }>;
  caps: Map<string, CapFile>;
  allCaps: Map<string, CapFile>;
  dependencies: Record<string, unknown> & { eventBus?: EventBus };
  eventsState?: EventsState;
  booted: boolean;
  circuitBreakerState?: Map<string, {
    failures: number;
    lastFailureTime: number | null;
    state: 'closed' | 'open' | 'half-open';
  }>;
  cacheStore?: Map<string, { value: unknown; expiry: number }>;
  warnOnDirectCall?: boolean;
}


export interface BootOptions {
  capsuleDirs?: string[];
  dependencies?: Record<string, unknown>;
  disableBuiltins?: string[] | boolean | '*';
  warnOnDirectCall?: boolean;
}
