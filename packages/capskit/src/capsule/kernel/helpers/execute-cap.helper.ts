import { CapInput, CapContext, CapHandler } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';
import { buildHooksPipeline, resolveHooks } from './build-hooks-pipeline.helper';
import { validateSchema } from './validate-schema.helper';
import { handleFallback } from './execution/execute-resiliency.helper';
import { withTracing } from './execution/execute-tracing.helper';

/**
 * Executes a cap through the full kernel pipeline:
 * hook resolution → pre hooks → handler → post hooks → error wrapping.
 * This is the shared execution path used by call.cap.ts, ctx.call(), ctx.use(), and ctx.emit().
 * Implements resiliency configurations (circuit breakers, cache/action fallbacks) defined on CapMeta.
 */
export async function executeCap(
  capPath: string,
  payload: unknown,
  ctx: CapContext,
  visited?: Set<string>,
): Promise<unknown> {
  const capEntry = ctx.deps.capsMap.get(capPath);
  if (!capEntry) {
    throw new Error(`Action not found: Cap "${capPath}" not found`);
  }

  const capMeta = capEntry.meta;

  return withTracing(capPath, payload, async () => {
    const platform = (ctx.deps as any).capskit;
    const interceptors = platform?.interceptors || [];

    const executeBody = async () => {
      const capHookNames = capMeta.hooks || [];

      // Look up capsule definition for capsule-level hooks
      const capsuleDef = ctx.deps.capsules.get(capEntry.capsuleName);
      const capsuleHooks = capsuleDef?.def?.hooks;

      const allCaps = ctx.deps.allCaps;

      // Save previous action context to restore after nested calls
      const prevCapPath = ctx.capPath;
      const prevActionName = ctx.actionName;
      const prevResult = ctx.result;
      const prevBody = (ctx as any).body;
      const prevParams = (ctx as any).params;
      const prevQuery = (ctx as any).query;

      const cbStateMap = ctx.deps.circuitBreakerState;
      const resiliency = capMeta.resiliency;

      // 1. Pre-execution Circuit Breaker check
      if (resiliency?.circuitBreaker && cbStateMap) {
        const cb = resiliency.circuitBreaker;
        const failureThreshold = cb.failureThreshold ?? 5;
        const resetTimeoutMs = cb.resetTimeoutMs ?? 30000;

        let cbState = cbStateMap.get(capPath);
        if (!cbState) {
          cbState = { failures: 0, lastFailureTime: null, state: 'closed' };
          cbStateMap.set(capPath, cbState);
        }

        if (cbState.state === 'open') {
          if (cbState.lastFailureTime !== null && Date.now() - cbState.lastFailureTime >= resetTimeoutMs) {
            cbState.state = 'half-open';
          } else {
            const fb = resiliency?.fallback;
            if (fb) {
              return handleFallback(capPath, capMeta, payload, ctx, visited);
            }
            throw new Error('Circuit breaker is open');
          }
        }
      }

      try {
        // Set action context fields for hooks to use
        ctx.capPath = capPath;
        ctx.actionName = capMeta.name;
        ctx.result = undefined;

        const { pre, post } = resolveHooks(
          capHookNames,
          allCaps,
          capsuleHooks,
          capMeta.name,
          capEntry.capsuleName,
        );

        const pipeline = buildHooksPipeline(pre, post, capEntry.handler);

        // Normalize payload to { body, params, query } format
        const hasBody = payload && typeof payload === 'object' && 'body' in payload;
        const normalizedPayload = hasBody
          ? (payload as Record<string, unknown>)
          : { body: payload, params: {}, query: {} };

        (ctx as any).body = normalizedPayload.body || {};
        (ctx as any).params = normalizedPayload.params || {};
        (ctx as any).query = normalizedPayload.query || {};

        // Validate input against capMeta.inputSchema
        validateSchema(normalizedPayload, capMeta.inputSchema, capPath, false);

        const mergedInput: CapInput = {
          ...normalizedPayload,
        };

        const result = await pipeline(mergedInput, ctx);

        // On success: reset circuit breaker
        if (resiliency?.circuitBreaker && cbStateMap) {
          const cbState = cbStateMap.get(capPath);
          if (cbState) {
            cbState.failures = 0;
            cbState.state = 'closed';
            cbState.lastFailureTime = null;
          }
        }

        // Cache result if cache fallback is configured
        if (resiliency?.fallback?.type === 'cache' && ctx.deps.cacheStore) {
          const ttl = resiliency.fallback.cacheTtlMs ?? 30000;
          ctx.deps.cacheStore.set(capPath, { value: result, expiry: Date.now() + ttl });
        }

        // Validate output against capMeta.outputSchema
        if (capMeta.outputSchema) {
          const strict = (capMeta.outputSchema as any).strict === true;
          if (strict) {
            const nestedSchema = (capMeta.outputSchema as any).schema || capMeta.outputSchema;
            validateSchema(result, nestedSchema, capPath, true);
          }
        }

        return result;
      } catch (err: unknown) {
        // On failure: update circuit breaker
        if (resiliency?.circuitBreaker && cbStateMap) {
          const cb = resiliency.circuitBreaker;
          const failureThreshold = cb.failureThreshold ?? 5;
          let cbState = cbStateMap.get(capPath);
          if (!cbState) {
            cbState = { failures: 0, lastFailureTime: null, state: 'closed' };
            cbStateMap.set(capPath, cbState);
          }
          cbState.failures += 1;
          cbState.lastFailureTime = Date.now();
          if (cbState.failures >= failureThreshold) {
            cbState.state = 'open';
          }
        }

        if (resiliency?.fallback) {
          return handleFallback(capPath, capMeta, payload, ctx, visited, err);
        }
        throw err;
      } finally {
        // Always restore previous action context, even on error
        ctx.capPath = prevCapPath;
        ctx.actionName = prevActionName;
        ctx.result = prevResult;
        (ctx as any).body = prevBody;
        (ctx as any).params = prevParams;
        (ctx as any).query = prevQuery;
      }
    };

    if (interceptors.length === 0) {
      return executeBody();
    }

    let idx = 0;
    const next = async () => {
      if (idx >= interceptors.length) return executeBody();
      const interceptor = interceptors[idx++];
      return interceptor(capPath, payload, ctx, next);
    };
    return next();
  });
}
