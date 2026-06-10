import { CapContext } from '../types/cap-input.type';
import { InternalState } from '../types/platform.types';
import { executeCap } from './execute-cap.helper';

/**
 * Normalizes a raw payload to { body, params, query } format for consistent handler input.
 */
function normalizePayload(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'body' in payload) {
    return payload;
  }
  return { body: payload, params: {}, query: {} };
}

/**
 * Builds a CapContext from the current platform state.
 * All call paths (call(), emit(), use()) go through the shared kernel pipeline
 * via executeCap(), ensuring hook resolution, validation, and error wrapping.
 */
export function buildContext(state: InternalState): CapContext {
  const ctxRef: { current: CapContext | null } = { current: null };

  const callFn = async (capPath: string, payload: unknown) => {
    const cap = state.caps.get(capPath);
    if (!cap) throw new Error(`Cap "${capPath}" not found`);
    return executeCap(capPath, normalizePayload(payload), ctxRef.current!);
  };

  const ctx: CapContext = {
    deps: {
      ...state.dependencies,
      capsules: state.capsules,
      capsMap: state.caps,
      allCaps: state.allCaps,
      dependencies: state.dependencies,
      eventsState: state.eventsState,
      circuitBreakerState: state.circuitBreakerState,
      cacheStore: state.cacheStore,
    },
    emit: (event: string, data: unknown) => {
      const emitCap = state.caps.get('events.emit');
      if (emitCap) {
        executeCap('events.emit', { body: { event, data } }, ctxRef.current!);
      } else {
        const adapterEventBus = state.dependencies.eventBus;
        if (adapterEventBus) {
          adapterEventBus.dispatch(event, data);
        }
      }
    },
    call: new Proxy(callFn, {
      get(_target: any, capsuleName: string | symbol) {
        if (typeof capsuleName !== 'string') return undefined;
        return new Proxy({}, {
          get(_t2: any, actionName: string | symbol) {
            if (typeof actionName !== 'string') return undefined;
            return async (payload?: unknown) => {
              const capPath = `${capsuleName}.${actionName}`;
              const cap = state.caps.get(capPath);
              if (!cap) throw new Error(`Cap "${capsuleName}.${actionName}" not found`);
              return executeCap(capPath, normalizePayload(payload), ctxRef.current!);
            };
          }
        });
      },
      apply(_target: any, _thisArg: any, args: any[]) {
        const [capPath, payload] = args as [string, unknown?];
        const cap = state.caps.get(capPath);
        if (!cap) throw new Error(`Cap "${capPath}" not found`);
        return executeCap(capPath, normalizePayload(payload), ctxRef.current!);
      }
    }) as any,
    use: <T = unknown>(capsuleName: string): T => {
      return new Proxy({}, {
        get(_target, prop: string) {
          return async (payload: unknown) => {
            const capPath = `${capsuleName}.${prop}`;
            const cap = state.caps.get(capPath);
            if (!cap) throw new Error(`Cap "${capPath}" not found`);
            return executeCap(capPath, normalizePayload(payload), ctxRef.current!);
          };
        },
      }) as T;
    },
  };

  ctxRef.current = ctx;
  return ctx;
}
