import { CapContext } from '../../types/cap-input.type';
import { CapMeta } from '../../types/cap-meta.type';
import { executeCap } from '../execute-cap.helper';

/**
 * Helper to handle fallback logic for action, cache fallbacks.
 */
export async function handleFallback(
  capPath: string,
  capMeta: CapMeta,
  payload: unknown,
  ctx: CapContext,
  visited?: Set<string>,
  originalError?: unknown,
): Promise<unknown> {
  const fallback = capMeta.resiliency?.fallback;
  if (!fallback) {
    throw originalError ?? new Error('Action failed with no fallback');
  }

  if (fallback.type === 'action' && fallback.action === capPath) {
    throw new Error('Fallback action cannot be the same as the failing action');
  }

  const currentVisited = visited ? new Set(visited) : new Set<string>();
  if (currentVisited.has(capPath)) {
    throw new Error('Circular fallback detected');
  }
  currentVisited.add(capPath);

  if (fallback.type === 'action' && fallback.action) {
    const fallbackAction = fallback.action;
    if (!ctx.deps.capsMap.has(fallbackAction)) {
      throw new Error(`Fallback action "${fallbackAction}" not found`);
    }
    return executeCap(fallbackAction, payload, ctx, currentVisited);
  }

  if (fallback.type === 'cache') {
    const cacheStore = ctx.deps.cacheStore;
    const cached = cacheStore?.get(capPath);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }
    throw originalError ?? new Error('Action failed and cache miss');
  }

  throw originalError ?? new Error('Unknown fallback type');
}
