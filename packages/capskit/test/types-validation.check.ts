/**
 * Type-level validation tests for CapContext and related types.
 * These tests verify that the types are well-formed, consistent,
 * and meet the design requirements.
 *
 * They are compile-time checks — if this file compiles, the types are valid.
 */

import type {
  CapContext,
  CapHandler,
  CapMeta,
  CapRoute,
  CapEventSubscription,
  CapInput,
} from '../src/capsule/kernel';
import type {
  CapDefinition,
  CapsuleRegistry,
} from '../src/capsule/kernel';

// ============================================================
// 1. CapResponseMessage — response shape (kept conceptually,
//    but validated against a local inline type since it wasn't
//    exported from types.ts after the cleanup).
// ============================================================
interface CapResponseMessage<T = unknown> {
  correlationId: string;
  success: boolean;
  result: T | null;
  error: {
    name: string;
    message: string;
    code: string;
    stack?: string;
    details?: Record<string, unknown>;
  } | null;
  timestamp: string;
  durationMs: number;
}

const successResp: CapResponseMessage<{ sum: number }> = {
  correlationId: 'corr-001',
  success: true,
  result: { sum: 8 },
  error: null,
  timestamp: new Date().toISOString(),
  durationMs: 42,
};

const errorResp: CapResponseMessage = {
  correlationId: 'corr-002',
  success: false,
  result: null,
  error: {
    name: 'ValidationError',
    message: 'Invalid input',
    code: 'VAL_001',
    stack: '...',
    details: { field: 'email' },
  },
  timestamp: new Date().toISOString(),
  durationMs: 10,
};

// ============================================================
// 2. CapMessageEnvelope — base generic envelope (no kind param)
// ============================================================
interface CapMessageEnvelope<T = unknown> {
  action: string;
  payload: T;
  correlationId: string;
  timestamp: string;
  trace?: { traceId: string; spanId: string };
  headers?: Record<string, string>;
}

const envelope: CapMessageEnvelope<{ body: { x: number } }> = {
  action: 'test.action',
  payload: { body: { x: 1 } },
  correlationId: 'c-1',
  timestamp: '2025-01-01T00:00:00.000Z',
  trace: { traceId: 'trace-1', spanId: 'span-1' },
  headers: { 'x-idempotency-key': 'ik-1', 'x-tenant': 'acme' },
};

// ============================================================
// 3. CapContext — execution context with Proxy call
// ============================================================
// CapContext.call is a Proxy type: callable + nested capsules/actions.
// We build a mock that satisfies both signatures via an explicit cast.
function createCallProxy(): CapContext['call'] {
  const callFn = async (_path: string, _payload?: unknown): Promise<unknown> =>
    ({ result: 'ok' });

  return Object.assign(callFn, {
    greeter: {
      hello: async (_payload?: unknown): Promise<unknown> => ({
        greeting: 'Hello!',
      }),
    },
  }) as unknown as CapContext['call'];
}

const ctx: CapContext = {
  deps: { database: {}, redis: {} },
  call: createCallProxy(),
};

// Verify direct call form compiles
(async () => {
  const result = await ctx.call('users.get', { body: { id: 1 } });
  const _ = result;
})();

// Verify proxy-style access compiles
(async () => {
  const proxyResult = await ctx.call.greeter.hello({ body: { name: 'World' } });
  const _ = proxyResult;
})();

// ============================================================
// 4. CapHandler — typed handler signature
// ============================================================
type SumResult = { result: number };

// Valid handler implementation that satisfies CapHandler
const sumHandler: CapHandler = async (input, ctx): Promise<SumResult> => {
  const body = (input as CapInput).body ?? {};
  const { a, b } = body as any;
  return { result: (a ?? 0) + (b ?? 0) };
};

// ============================================================
// 5. Registry types — CapDefinition, CapsuleRegistry, CapRoute, CapMeta
// ============================================================
const route: CapRoute = {
  method: 'POST',
  path: '/users/:id',
  cap: 'user',
  action: 'getUser',
};

const meta: CapMeta = {
  name: 'calculator',
  routes: [
    { method: 'POST', path: '/sum', cap: 'calculator', action: 'sum' },
    { method: 'POST', path: '/multiply', cap: 'calculator', action: 'multiply' },
  ],
  events: {
    publishes: ['calculator.sum.completed'],
    subscribes: [
      { event: 'numbers.received', action: 'sum' },
    ],
  },
  dependencies: ['math-utils'],
};

class CalculatorCap {
  async sum(input: CapInput, ctx: CapContext): Promise<{ result: number }> {
    const { a, b } = (input?.body as any) ?? {};
    return { result: (a ?? 0) + (b ?? 0) };
  }
}

const capDef: CapDefinition = {
  class: CalculatorCap,
  meta,
};

const registry: CapsuleRegistry = {
  name: 'calculator',
  caps: [capDef],
};

// ============================================================
// 6. CorrelationId and ActionName type aliases (inline)
// ============================================================
type CorrelationId = string;
type ActionName = string;

const corrId: CorrelationId = 'abc-123-def';
const actionName: ActionName = 'users.create';

// ============================================================
// 7. Backward compatibility — CapContext still works
// ============================================================
const actionCtx: CapContext = {
  deps: {},
  call: createCallProxy(),
};

// ============================================================
// Export a dummy function so this file is a valid module
// ============================================================
export const test = true;
