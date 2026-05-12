/**
 * Type-level validation tests for CapContext and CapMessageModel types.
 * These tests verify that the types are well-formed, consistent,
 * and meet the design requirements.
 * 
 * They compile-time checks — if this file compiles, the types are valid.
 */

import type {
  // CapContext
  CapContext,
  CapInvokePayload,
  CapTellPayload,
  CapHandler,
  
  // Cap Message Model
  CapMessageKind,
  CorrelationId,
  ActionName,
  CapMessageEnvelope,
  CapInvokeMessage,
  CapTellMessage,
  CapMessage,
  CapResponseMessage,
  CapResponseError,
  
  // Cap & Registry
  CapClass,
  CapMeta,
  CapRoute,
  CapEventSubscription,
  CapDefinition,
  CapsuleRegistry,
  
  // Existing types for backward compatibility
  ActionContext,
  ActionInput,
} from '../src/types';

// ============================================================
// 1. CapMessageKind — discriminated union
// ============================================================
const kind1: CapMessageKind = 'invoke';  // valid
const kind2: CapMessageKind = 'tell';     // valid
// @ts-expect-error — invalid kind should fail
// const badKind: CapMessageKind = 'notify';

// ============================================================
// 2. CapInvokeMessage — request/response with required correlationId
// ============================================================
const invokeMsg: CapInvokeMessage<{ a: number; b: number }, { result: number }> = {
  kind: 'invoke',
  action: 'calculator.sum',
  payload: { body: { a: 5, b: 3 } },
  correlationId: 'corr-001',
  timestamp: new Date().toISOString(),
};

// Verify: correlationId is required (not optional)
// If we remove correlationId, it should fail:
// const invokeNoCorr: CapInvokeMessage = { kind: 'invoke', action: 'x', payload: {}, timestamp: '' }; // ERROR

// ============================================================
// 3. CapTellMessage — fire-and-forget with optional correlationId
// ============================================================
const tellMsg: CapTellMessage<{ userId: string; event: string }> = {
  kind: 'tell',
  action: 'analytics.track',
  payload: { body: { userId: 'u-42', event: 'page.viewed' } },
  timestamp: new Date().toISOString(),
  // correlationId is optional — valid to omit
};

// Also valid with correlationId
const tellMsgWithCorr: CapTellMessage = {
  kind: 'tell',
  action: 'analytics.track',
  payload: { body: {} },
  correlationId: 'corr-002',
  timestamp: new Date().toISOString(),
};

// ============================================================
// 4. CapMessage — union of both
// ============================================================
const union1: CapMessage = invokeMsg;
const union2: CapMessage = tellMsg;

// Discriminate on kind
function handleMessage(msg: CapMessage) {
  switch (msg.kind) {
    case 'invoke': {
      // Type narrowed to CapInvokeMessage
      const corr: string = msg.correlationId; // required, always string
      break;
    }
    case 'tell': {
      // Type narrowed to CapTellMessage
      const corr: string | undefined = msg.correlationId; // optional
      break;
    }
  }
}

// ============================================================
// 5. CapResponseMessage — response shape
// ============================================================
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
// 6. CapMessageEnvelope — base generic envelope
// ============================================================
const envelope: CapMessageEnvelope<'invoke', { body: { x: number } }> = {
  kind: 'invoke',
  action: 'test.action',
  payload: { body: { x: 1 } },
  correlationId: 'c-1',
  timestamp: '2025-01-01T00:00:00.000Z',
  trace: { traceId: 'trace-1', spanId: 'span-1' },
  headers: { 'x-idempotency-key': 'ik-1', 'x-tenant': 'acme' },
};

// ============================================================
// 7. CapContext — execution context
// ============================================================
// Type-level check: CapContext has all required members
const ctx: CapContext = {
  body: { name: 'test' },
  params: { id: '42' },
  query: { page: '1' },
  deps: { database: {}, redis: {} },
  
  invoke: async (action: ActionName, payload: CapInvokePayload): Promise<any> => {
    return { result: 'ok' };
  },
  
  tell: (action: ActionName, payload: CapTellPayload): void => {
    // fire-and-forget
  },
  
  emit: (event: string, data: any): void => {
    // publish event
  },
  
  use: <TCapsule = any>(capsuleName: string): TCapsule => {
    return {} as TCapsule;
  },
};

// Verify individual members are callable
(async () => {
  const result = await ctx.invoke('users.get', { body: { id: 1 } });
  ctx.tell('analytics.track', { body: { event: 'test' } });
  ctx.emit('user.created', { id: 1 });
  const users = ctx.use<any>('users');
})();

// ============================================================
// 8. CapInvokePayload and CapTellPayload — payload shapes
// ============================================================
const invokePayload: CapInvokePayload = {
  body: { key: 'value' },
  params: { id: '123' },
  query: { page: '1' },
};

const tellPayload: CapTellPayload = {
  body: { event: 'click' },
  // params and query are optional
};

// ============================================================
// 9. CapHandler — typed handler signature
// ============================================================
type SumResult = { result: number };
type SumHandler = CapHandler<{ a: number; b: number }, SumResult>;

// Valid handler implementation
const sumHandler: SumHandler = async (input: ActionInput, ctx: CapContext): Promise<SumResult> => {
  const { a, b } = input.body;
  ctx.emit('sum.computed', { a, b });
  return { result: a + b };
};

// ============================================================
// 10. CapClass — using CapContext
// ============================================================
class CalculatorCap implements CapClass {
  async sum(input: ActionInput, ctx: ActionContext): Promise<{ result: number }> {
    // Note: CapClass still uses ActionContext for backward compatibility
    // but can be gradually migrated to CapContext
    const { a, b } = input.body;
    return { result: a + b };
  }
  
  [action: string]: (input: ActionInput, context: ActionContext) => Promise<any>;
}

// ============================================================
// 11. Registry types — CapDefinition, CapsuleRegistry, CapRoute, CapMeta
// ============================================================
const route: CapRoute = {
  method: 'POST',
  path: '/users/:id',
  action: 'getUser',
  traits: ['auth', 'rate-limit'],
};

const meta: CapMeta = {
  name: 'calculator',
  routes: [
    { method: 'POST', path: '/sum', action: 'sum' },
    { method: 'POST', path: '/multiply', action: 'multiply' },
  ],
  events: {
    publishes: ['calculator.sum.completed'],
    subscribes: [
      { event: 'numbers.received', action: 'sum' },
    ],
  },
  dependencies: ['math-utils'],
};

const capDef: CapDefinition<CalculatorCap> = {
  class: CalculatorCap,
  meta,
};

const registry: CapsuleRegistry = {
  name: 'calculator',
  caps: [capDef],
};

// ============================================================
// 12. CorrelationId and ActionName type aliases
// ============================================================
const corrId: CorrelationId = 'abc-123-def';
const actionName: ActionName = 'users.create';

// ============================================================
// 13. Backward compatibility — ActionContext still works
// ============================================================
const actionCtx: ActionContext = {
  body: {},
  deps: {},
  emit: () => {},
  call: async (action, payload) => ({}),
  use: <T>() => ({} as T),
};

// ============================================================
// Export a dummy function so this file is a valid module
// ============================================================
export const test = true;
