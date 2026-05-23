import { CapInput, CapContext, CapHandler } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';
import { buildHooksPipeline, resolveHooks } from './build-hooks-pipeline.helper';
import { validateSchema } from './validate-schema.helper';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { redactPayload } from '../../../types';

/**
 * Helper to handle fallback logic for action, cache fallbacks.
 */
async function handleFallback(
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

/**
 * Executes a cap through the full kernel pipeline:
 * hook resolution → pre hooks → handler → post hooks → error wrapping.
 * This is the shared execution path used by call.cap.ts, ctx.call(), ctx.use(), and ctx.emit().
 * Implements resiliency configurations (circuit breakers, cache/action fallbacks) defined on CapMeta.
 */
function isTraceEnabled(): boolean {
  return process.env.CAPSKIT_TRACE === '1';
}

interface TraceInfo {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
}

const traceStorage = new AsyncLocalStorage<TraceInfo>();

function writeTrace(record: Record<string, unknown>): void {
  const line = JSON.stringify(record) + '\n';
  const traceFile = process.env.CAPSKIT_TRACE_FILE;
  if (traceFile) {
    try {
      fs.appendFileSync(traceFile, line);
    } catch {
      // Sink fallback: silently ignore file write failures so actions still succeed
    }
  } else {
    process.stdout.write(line);
  }
}

async function withTracing<T>(actionName: string, payload: unknown, handler: () => Promise<T>): Promise<T> {
  if (!isTraceEnabled()) return handler();

  const parent = traceStorage.getStore();
  const traceId = parent?.traceId ?? randomUUID();
  const spanId = randomUUID();
  const parentSpanId = parent?.spanId ?? null;

  const timestampStart = Date.now();
  let status = 'ok';
  let output: unknown = null;
  let error: { message: string; code?: string } | null = null;

  try {
    const result = await traceStorage.run({ traceId, spanId, parentSpanId }, async () => {
      return await handler();
    });
    output = result;
    return result;
  } catch (err: unknown) {
    status = 'error';
    if (err instanceof Error) {
      error = { message: err.message, code: (err as any).code };
    } else {
      error = { message: String(err) };
    }
    throw err;
  } finally {
    const timestampEnd = Date.now();
    writeTrace({
      traceId,
      spanId,
      parentSpanId,
      action: actionName,
      status,
      durationMs: timestampEnd - timestampStart,
      timestampStart,
      timestampEnd,
      input: redactPayload(payload),
      output: status === 'ok' ? redactPayload(output) : null,
      error,
    });
  }
}

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
    const platform = ctx.deps.capskit as any;
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
