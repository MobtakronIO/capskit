import { CapInput, CapContext, CapHandler, KernelDeps } from '../types/cap-input.type';
import { InternalState } from '../types/platform.types';

/**
 * Builds a CapContext from the current platform state.
 * The emit() delegates to the events capsule (canonical event system).
 */
export function buildContext(state: InternalState): CapContext {
  return {
    deps: {
      ...state.dependencies,
      capsules: state.capsules,
      capsMap: state.caps,
      allCaps: state.allCaps,
      dependencies: state.dependencies,
    },
    emit: (event: string, data: unknown) => {
      // Delegate to events capsule (canonical event system)
      const emitCap = state.caps.get('events.emit');
      if (emitCap) {
        emitCap.handler({ body: { event, data } }, buildContext(state));
      }
    },
    invoke: async (capPath: string, payload: unknown) => {
      const cap = state.caps.get(capPath);
      if (!cap) throw new Error(`Cap "${capPath}" not found`);
      return cap.handler(payload as CapInput, buildContext(state));
    },
    tell: async (capPath: string, payload: unknown) => {
      const cap = state.caps.get(capPath);
      if (cap) {
        cap.handler(payload as CapInput, buildContext(state)).catch(() => {});
      }
    },
    use: <T = unknown>(capsuleName: string): T => {
      return new Proxy({}, {
        get(_target, prop: string) {
          return async (payload: unknown) => {
            const capPath = `${capsuleName}.${prop}`;
            const cap = state.caps.get(capPath);
            if (!cap) throw new Error(`Cap "${capPath}" not found`);
            return cap.handler(payload as CapInput, buildContext(state));
          };
        },
      }) as T;
    },
  };
}
