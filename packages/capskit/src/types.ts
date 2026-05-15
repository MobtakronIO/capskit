export interface CapsuleManifest {
  name: string;
  requires?: string[];
  actions: Record<string, ActionDefinition>;
  events?: {
    publishes?: string[];
    subscribes?: EventSubscription[];
  };
  /**
   * Boot lifecycle configuration for the capsule.
   * Controls when and how a capsule initializes during the boot sequence.
   */
  boot?: BootLifecycle;
  // Allow system capsules to extend the manifest with their own definitions (e.g., routes, sockets)
  [key: string]: any;
}

/**
 * Manifest contract for third-party adapter plugins.
 * Adapters can export this manifest to declare compatibility and capabilities.
 */
export interface AdapterPluginManifest {
  /** Adapter package name */
  name: string;
  /** Adapter version (semver) */
  version: string;
  /** Compatible capskit version range */
  capskitVersion: {
    /** Minimum compatible capskit version (inclusive) */
    min: string;
    /** Maximum compatible capskit version (exclusive), undefined = no upper bound */
    max?: string;
  };
  /** Capabilities: 'http', 'websocket', or ['http', 'websocket'] */
  capabilities: string[];
  /** Optional description of the adapter */
  description?: string;
}

/**
 * Boot lifecycle configuration for a capsule.
 * Controls initialization order and readiness signaling.
 */
export interface BootLifecycle {
  /**
   * Initialization function called during the boot sequence.
   * The boot sequencer will wait for this Promise to resolve before
   * proceeding to the next capsule in topological order.
   * 
   * If not provided, the capsule is considered ready immediately.
   * 
   * @param context - Boot context containing dependencies and platform reference
   * @returns Promise that resolves when the capsule is ready, or void if synchronous
   * 
   * @example
   * ```typescript
   * boot: {
   *   init: async ({ deps, manifest }) => {
   *     await connectToDatabase(deps.database);
   *     console.log(`Capsule ${manifest.name} initialized`);
   *   }
   * }
   * ```
   */
  init?: (context: BootContext) => Promise<void> | void;

  /**
   * Whether this capsule's init must complete before dependents boot.
   * @default true
   * 
   * Set to false for optional capsules that don't block dependents.
   */
  blocking?: boolean;

  /**
   * Timeout in milliseconds for init to complete.
   * If exceeded, boot fails with an error.
   * 
   * Note: No timeout is applied by default (infinite wait).
   * 
   * @default Infinity
   */
  timeout?: number;

  /**
   * Event name to listen for readiness signaling.
   * 
   * If provided alongside init(), the capsule is considered ready when EITHER:
   * - The init() Promise resolves, OR
   * - The ready event is emitted on the platform
   * 
   * This enables integration with systems that signal readiness via events
   * rather than Promise return values.
   * 
   * @example
   * ```typescript
   * boot: {
   *   init: async ({ emit }) => {
   *     // Emit ready event when initialization is complete
   *     await something.setup();
   *     emit('ready', { capsule: 'my-capsule' });
   *   },
   *   ready: 'my-capsule.ready'  // Alternative: listen for this event
   * }
   * ```
   */
  ready?: string;
}

/**
 * Context passed to the boot init function.
 */
export interface BootContext {
  /**
   * The capsule's own manifest.
   */
  manifest: CapsuleManifest;
  /**
   * Injected dependencies as provided to the platform.
   * Includes both external dependencies (database, redis, etc.) and
   * the capskit platform reference.
   */
  deps: Record<string, any>;
  /**
   * Reference to the CapsKit platform instance.
   * Allows the init function to interact with other capsules if needed.
   */
  platform: any;
}

/**
 * Result of building a dependency graph from capsule manifests.
 */
export interface DependencyGraph {
  /**
   * Map of capsule name to its dependencies (external + inter-capsule).
   * External dependencies (not in the capsule set) are marked as resolved.
   */
  dependencies: Map<string, Set<string>>;
  /**
   * List of capsule names in topological order (boot order).
   */
  bootOrder: string[];
  /**
   * Set of capsule names that have no dependencies.
   */
  roots: Set<string>;
  /**
   * Set of capsule names that nothing depends on.
   */
  leaves: Set<string>;
}

/**
 * Error thrown when a dependency cycle is detected.
 */
export interface CycleError {
  code: 'CYCLE_ERROR';
  message: string;
  /**
   * The cycle path as an array of capsule names.
   * e.g. ['a', 'b', 'c', 'a'] for a cycle a → b → c → a
   */
  cycle: string[];
}

// ============================================================
// Trace Logging Types
// ============================================================

/**
 * Keys that are redacted from trace input/output payloads.
 */
const TRACE_REDACT_KEYS = [
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'cookie',
  'credentials',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  
  // Additional PII/sensitive fields
  'ssn',
  'socialSecurity',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'pin',
];

/**
 * A single trace span representing an action execution.
 */
export interface TraceSpan {
  /** Unique UUID for the entire trace (top-level call) */
  traceId: string;
  /** Unique UUID for this specific call span */
  spanId: string;
  /** Parent span ID (null for top-level calls) */
  parentSpanId: string | null;
  /** ISO timestamp when call started */
  timestampStart: string;
  /** ISO timestamp when call ended */
  timestampEnd: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Full action name (e.g., "user.create") */
  action: string;
  /** Calling capsule name (null if not available) */
  caller: string | null;
  /** Call status */
  status: 'ok' | 'error';
  /** Redacted input payload */
  input: Record<string, any>;
  /** Redacted output payload (null on error) */
  output: Record<string, any> | null;
  /** Error details (null on success) */
  error: {
    name: string;
    message: string;
    stack?: string;
  } | null;
}

/**
 * Alias for {@link TraceSpan} used by the tracing infrastructure.
 * @deprecated Use `TraceSpan` directly. Kept for backward compatibility
 * with kernel tracing module imports.
 */
export type TraceRecord = TraceSpan;

/**
 * Internal trace context stored in AsyncLocalStorage.
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
}

/**
 * Deep-redact sensitive keys from an object.
 * Returns a new object with sensitive keys replaced by [REDACTED].
 */
export function redactPayload(obj: any, depth = 0): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactPayload(item, depth + 1));
  }

  const redacted: Record<string, any> = {};
  const sensitiveLower = new Set(TRACE_REDACT_KEYS.map(k => k.toLowerCase()));

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveLower.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && depth < 10) {
      redacted[key] = redactPayload(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

export type ActionPreHook = (input: ActionInput, context: ActionContext) => Promise<void> | void;
export type ActionPostHook = (input: ActionInput, result: any, context: ActionContext) => Promise<any> | any;

/**
 * Cache configuration for action-level caching.
 * When specified on an action, results are cached based on the action name and input payload.
 */
export interface CacheConfig {
  /**
   * Time-to-live in milliseconds.
   * If not specified, cache entries do not expire.
   */
  ttl?: number;
  /**
   * Cache storage backend.
   * - 'memory': In-memory Map-based cache (default)
   * - 'sqlite': SQLite-based cache using better-sqlite3
   * - 'redis': Redis-based cache using ioredis
   */
  storage?: 'memory' | 'sqlite' | 'redis';
  /**
   * Optional custom cache key prefix.
   * If not specified, the cache key is derived from action name and payload hash.
   */
  key?: string;
}

export interface ActionDefinition {
  handler: string | ActionHandler;
  description?: string;
  pre?: ActionPreHook[];
  post?: ActionPostHook[];
  /**
   * Input schema for validation (JSON Schema draft-07 compatible).
   * Validates the request payload before the handler executes.
   * 
   * @example
   * ```typescript
   * inputSchema: {
   *   type: 'object',
   *   properties: {
   *     email: { type: 'string', format: 'email' },
   *     age: { type: 'number', minimum: 0 }
   *   },
   *   required: ['email']
   * }
   * ```
   */
  inputSchema?: ActionSchema;
  /**
   * Output schema for validation (JSON Schema draft-07 compatible).
   * When `strict` is true, validates the handler response before returning.
   * 
   * @example
   * ```typescript
   * outputSchema: {
   *   type: 'object',
   *   properties: {
   *     id: { type: 'string' },
   *     createdAt: { type: 'string', format: 'date-time' }
   *   },
   *   strict: true
   * }
   * ```
   */
  outputSchema?: OutputValidationOptions;
  /**
   * @deprecated Use `inputSchema` instead. `schema` is kept for backward compatibility.
   * The `schema` field is an alias for `inputSchema`.
   */
  schema?: ActionSchema;
  /**
   * Cache configuration for this action.
   * When specified, action results are cached based on the action name and input payload.
   */
  cache?: CacheConfig;
  /**
   * Resiliency configuration for this action.
   * Provides fallback behavior and circuit breaker when the action fails.
   */
  resiliency?: ResiliencyConfig;
}

/**
 * Resiliency configuration for action-level fallback and circuit breaker behavior.
 */
export interface ResiliencyConfig {
  /**
   * Fallback behavior to invoke when the action fails.
   * Supports retry, cache lookup, or invoking another action.
   */
  fallback?: FallbackConfig;
  /**
   * Circuit breaker configuration.
   * When consecutive failures exceed the threshold, the circuit opens
   * and subsequent calls fail fast (or use fallback).
   */
  circuitBreaker?: CircuitBreakerConfig;
}

/**
 * Fallback configuration for a resilient action.
 */
export interface FallbackConfig {
  /**
   * Fallback type:
   * - 'retry': Retry the same action with backoff
   * - 'cache': Return cached result from previous successful calls
   * - 'action': Invoke a different action as fallback
   */
  type: 'retry' | 'cache' | 'action';
  /**
   * Max number of retries when type is 'retry'.
   */
  maxRetries?: number;
  /**
   * Backoff delay in milliseconds between retries.
   */
  retryDelayMs?: number;
  /**
   * Cache TTL in milliseconds when type is 'cache'.
   * Fallback cache entries expire after this duration.
   */
  cacheTtlMs?: number;
  /**
   * Fallback action name when type is 'action'.
   * Must be a fully qualified action name (e.g., 'user.createGuest').
   */
  action?: string;
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening the circuit.
   * @default 3
   */
  failureThreshold?: number;
  /**
   * Time in milliseconds before the circuit transitions from open to half-open.
   * @default 30000 (30 seconds)
   */
  resetTimeoutMs?: number;
  /**
   * Number of consecutive successes required in half-open state to close the circuit.
   * @default 1
   */
  successThreshold?: number;
}

/**
 * Circuit breaker state tracked per-action by the kernel.
 *
 * The circuit breaker follows the standard three-state model:
 * - `closed`: Normal operation; failures are counted.
 * - `open`: Failures exceeded threshold; calls fail fast.
 * - `half-open`: After resetTimeoutMs, a limited number of trial calls are allowed.
 */
export interface CircuitBreakerState {
  /** Number of consecutive failures in the current window */
  consecutiveFailures: number;
  /** Number of consecutive successes (relevant in half-open state) */
  consecutiveSuccesses: number;
  /** Timestamp (ms) of the last failure, or null if never failed */
  lastFailureTime: number | null;
  /** Timestamp (ms) of the last success, or null if never succeeded */
  lastSuccessTime: number | null;
  /**
   * Timestamp (ms) when the circuit will transition from open to half-open.
   * Set when the circuit opens. `null` when the circuit is closed or half-open.
   */
  nextResetTime: number | null;
  /** Current circuit state: closed, open, or half-open */
  status: 'closed' | 'open' | 'half-open';
}

export interface ActionSchema {
  type: 'object';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

/**
 * JSON Schema property definition (subset of JSON Schema draft-07).
 */
export interface JsonSchemaProperty {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'integer';
  format?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: any[];
  items?: JsonSchemaProperty;
  nullable?: boolean;
  default?: any;
}

/**
 * Validation error detail for a specific field.
 */
export interface FieldValidationError {
  field: string;
  message: string;
  value?: any;
  constraint: string;
}

/**
 * Result of validating a payload against a schema.
 */
export interface ValidationResult {
  valid: boolean;
  errors: FieldValidationError[];
}

/**
 * Output validation options for an action.
 */
export interface OutputValidationOptions {
  /** Enable strict output validation */
  strict?: boolean;
  /** Custom output schema (uses input schema if not specified) */
  schema?: ActionSchema;
}

export type ActionHandler = (input: ActionInput, context: ActionContext) => Promise<any>;

export type ActionInterceptor = (actionName: string, input: ActionInput, context: ActionContext, next: () => Promise<any>) => Promise<any>;

export interface ActionContext {
  params?: any;
  body?: any;
  query?: any;
  deps: Record<string, any>;
  emit: (event: string, data: any) => void;
  call: (action: string, payload: any) => Promise<any>;
  use: <TCapsule = any>(capsuleName: string) => TCapsule;
  /**
   * Proxy-based RPC (request/response).
   * 
   * Access services and actions as chained properties.
   * The final property call dispatches the action and returns a Promise.
   * 
   * @example
   * ```typescript
   * // Instead of: await ctx.call('users.create', { body: { name: 'Alice' } })
   * // Use:        await ctx.invoke.users.create({ body: { name: 'Alice' } })
   * ```
   */
  invoke: { [serviceName: string]: { [actionName: string]: (payload: any) => Promise<any> } };
  /**
   * Proxy-based fire-and-forget.
   * 
   * Same chained property access pattern as invoke, but dispatches
   * without waiting for a response. Ideal for notifications, logging,
   * and side-effects.
   * 
   * @example
   * ```typescript
   * ctx.tell.analytics.track({ body: { event: 'page.viewed' } });
   * ```
   */
  tell: { [serviceName: string]: { [actionName: string]: (payload: any) => void } };
}

export interface ActionInput {
  body: any;
  params?: any;
  query?: Record<string, any>; // Always an object, never undefined
}

export interface EventSubscription {
  event: string;
  action: string;
}

// ============================================================
// Cap & Capsule Registry Types
// ============================================================

// ============================================================
// Cap Message Model Types
// ============================================================

/**
 * Discriminated message kind for Cap communication.
 * The kernel routes messages based on their kind:
 * - `invoke`: Request/response RPC — sender expects a response.
 * - `tell`: Fire-and-forget — sender does NOT wait for a response.
 */
export type CapMessageKind = 'invoke' | 'tell';

/**
 * Unique correlation identifier for request/response pairing.
 * Generated by the kernel when an invoke message is dispatched.
 * The response message echoes this correlationId so the caller
 * can match the response to the original request.
 */
export type CorrelationId = string;

/**
 * Fully qualified action name (e.g., `"users.create"`, `"orders.fulfill"`).
 * Combines the capsule name with the action name, separated by a dot.
 */
export type ActionName = string;

/**
 * Base message envelope shared by all Cap messages.
 *
 * Every message flowing through the kernel carries this envelope.
 * It provides the metadata the kernel needs to route, trace,
 * and optionally correlate messages.
 *
 * @template TKind - The message kind (invoke or tell)
 * @template TPayload - The payload shape carried by the message
 */
export interface CapMessageEnvelope<TKind extends CapMessageKind = CapMessageKind, TPayload = any> {
  /**
   * Discriminator for message routing.
   * - `invoke`: Expect a response (request/response pattern).
   * - `tell`: Fire-and-forget (no response expected).
   */
  kind: TKind;

  /**
   * Fully qualified target action name.
   * Format: `"<capsule>.<action>"` (e.g., `"calculator.sum"`).
   */
  action: ActionName;

  /**
   * The payload to deliver to the action handler.
   * Must conform to the {@link ActionInput} shape (with `body`, optional `params`, `query`).
   */
  payload: TPayload;

  /**
   * Correlation ID for request/response pairing.
   * Required for `invoke` messages so the response can be routed back.
   * Optional for `tell` messages (may be present for tracing but not required).
   */
  correlationId?: CorrelationId;

  /**
   * Timestamp (ISO 8601) when the message was created.
   * Set by the kernel at dispatch time. Useful for tracing and timeout computation.
   */
  timestamp: string;

  /**
   * Optional trace context for distributed tracing.
   * Carries the trace ID and parent span ID across asynchronous boundaries.
   */
  trace?: TraceContext;

  /**
   * Optional headers/metadata bag for cross-cutting concerns
   * (e.g., idempotency keys, tenant IDs, locale hints).
   */
  headers?: Record<string, string>;
}

/**
 * An invoke message — the sender expects a response.
 *
 * This is the core request/response (RPC) pattern.
 * The kernel dispatches the message, waits for the handler to complete,
 * and returns the result (or an error) to the caller.
 *
 * @template TPayload - The payload shape for the target action
 * @template TResponse - The expected response shape
 *
 * @example
 * ```typescript
 * const msg: CapInvokeMessage<{ a: number; b: number }, { result: number }> = {
 *   kind: 'invoke',
 *   action: 'calculator.sum',
 *   payload: { body: { a: 5, b: 3 } },
 *   correlationId: crypto.randomUUID(),
 *   timestamp: new Date().toISOString()
 * };
 * ```
 */
export interface CapInvokeMessage<TPayload = any, TResponse = any> extends CapMessageEnvelope<'invoke', TPayload> {
  kind: 'invoke';
  /** Required for invoke — the response echoes this ID */
  correlationId: CorrelationId;
}

/**
 * A tell message — fire-and-forget, no response expected.
 *
 * The kernel dispatches the message and returns immediately.
 * The caller does not wait for the handler to complete.
 * This is useful for notifications, logging, async side-effects,
 * and event-driven workflows.
 *
 * @template TPayload - The payload shape for the target action
 *
 * @example
 * ```typescript
 * const msg: CapTellMessage<{ userId: string; event: string }> = {
 *   kind: 'tell',
 *   action: 'analytics.track',
 *   payload: { body: { userId: 'u-42', event: 'page.viewed' } },
 *   timestamp: new Date().toISOString()
 * };
 * ```
 */
export interface CapTellMessage<TPayload = any> extends CapMessageEnvelope<'tell', TPayload> {
  kind: 'tell';
  /** Optional for tell — may be present for tracing but not required */
  correlationId?: CorrelationId;
}

/**
 * Union of all possible Cap message types.
 * The kernel uses the `kind` discriminant to determine routing behavior.
 */
export type CapMessage =
  | CapInvokeMessage
  | CapTellMessage;

/**
 * Response message returned after an invoke completes.
 *
 * When an `invoke` message is processed, the kernel constructs
 * a response message that carries either the successful result
 * or an error.
 *
 * @template TResponse - The shape of the successful response payload
 */
export interface CapResponseMessage<TResponse = any> {
  /**
   * Echoes the correlationId from the original invoke message.
   * The caller uses this to match the response to the pending request.
   */
  correlationId: CorrelationId;

  /**
   * Whether the action completed successfully.
   * - `true`: The `result` field contains the handler's return value.
   * - `false`: The `error` field contains error details.
   */
  success: boolean;

  /**
   * The action handler's return value when `success` is true.
   * `null` when `success` is false.
   */
  result: TResponse | null;

  /**
   * Error details when `success` is false.
   * `null` when `success` is true.
   */
  error: CapResponseError | null;

  /**
   * ISO 8601 timestamp when the response was created.
   */
  timestamp: string;

  /**
   * Duration in milliseconds from the original invoke message timestamp
   * to when the response was created. Useful for performance monitoring.
   */
  durationMs: number;
}

/**
 * Error shape carried in a failed CapResponseMessage.
 */
export interface CapResponseError {
  /** Error name (e.g., "ValidationError", "NotFoundError") */
  name: string;
  /** Human-readable error message */
  message: string;
  /** Optional error code for programmatic handling */
  code?: string;
  /** Optional stack trace (may be stripped in production) */
  stack?: string;
  /** Optional additional error context */
  details?: any;
}

// ============================================================
// CapContext — Execution Context for Cap Methods
// ============================================================

/**
 * The execution context passed to every Cap method.
 *
 * `CapContext` is the primary interface through which Cap business logic
 * interacts with the CapsKit runtime. It provides four core capabilities:
 *
 * | Capability   | Method              | Pattern                  |
 * |--------------|---------------------|--------------------------|
 * | Request/Resp | `ctx.invoke()`      | RPC — wait for response  |
 * | Fire-forget  | `ctx.tell()`        | Async — no response      |
 * | Events       | `ctx.emit()`        | Publish to event bus     |
 * | Dependencies | `ctx.deps`          | Injected services        |
 *
 * Additionally, `ctx.use()` provides a typed proxy for direct capsule access,
 * and `ctx.body`/`ctx.params`/`ctx.query` carry the parsed request data
 * when the action is invoked via an HTTP transport.
 *
 * @example
 * ```typescript
 * class OrderCap implements CapClass {
 *   async placeOrder(input: ActionInput, ctx: CapContext): Promise<{ orderId: string }> {
 *     // Validate via injected service
 *     const valid = await ctx.invoke('inventory.check', { body: input.body.items });
 *
 *     // Create order
 *     const order = await ctx.deps.database.orders.create(input.body);
 *
 *     // Fire-and-forget notification
 *     ctx.tell('notifications.send', {
 *       body: { userId: input.body.userId, type: 'order.placed', orderId: order.id }
 *     });
 *
 *     // Emit domain event
 *     ctx.emit('order.placed', { orderId: order.id });
 *
 *     return { orderId: order.id };
 *   }
 * }
 * ```
 */
export interface CapContext {
  // ── Transport-agnostic input ──────────────────────────────

  /**
   * The request body (when invoked via HTTP or similar transport).
   * This is the primary payload for the action.
   */
  body: any;

  /**
   * Route/path parameters extracted from the URL pattern.
   * Example: `{ id: '42' }` for route `/users/:id`.
   */
  params?: any;

  /**
   * Query string parameters parsed as an object.
   * Always an object (never undefined), even for non-HTTP invocations.
   */
  query?: Record<string, any>;

  // ── Dependency injection ──────────────────────────────────

  /**
   * Injected dependencies provided at platform startup.
   *
   * Contains both external dependencies (database, redis, third-party clients)
   * and the capsule's declared dependencies (other capsules via `ctx.use()`).
   *
   * Dependencies are keyed by their registered name and are available
   * to all actions across all capsules.
   *
   * @example
   * ```typescript
   * const db = ctx.deps.database;
   * const redis = ctx.deps.redis;
   * ```
   */
  deps: Record<string, any>;

  // ── Inter-cap communication ───────────────────────────────

  /**
   * **Request/Response (RPC) proxy.**
   *
   * Invokes another action and waits for its response.
   * This is the primary way to call across cap/capsule boundaries.
   *
   * Under the hood, `invoke` constructs a {@link CapInvokeMessage}, dispatches it
   * through the kernel's interceptor pipeline, and returns the handler's result.
   *
   * @param action - Fully qualified action name (e.g., `"inventory.check"`)
   * @param payload - The payload to send (must have a `body` property)
   * @returns A Promise resolving to the action handler's return value
   *
   * @example
   * ```typescript
   * const stock = await ctx.invoke('inventory.check', { body: { sku: 'ABC-123' } });
   * ```
   */
  invoke: (action: ActionName, payload: CapInvokePayload) => Promise<any>;

  /**
   * **Fire-and-forget proxy.**
   *
   * Dispatches a message to another action without waiting for a response.
   * The kernel delivers the message asynchronously; the caller continues
   * immediately. Ideal for notifications, logging, side-effects, and
   * event-driven workflows where the caller does not need the result.
   *
   * Under the hood, `tell` constructs a {@link CapTellMessage} and dispatches it
   * through the kernel. No response is produced.
   *
   * @param action - Fully qualified action name (e.g., `"analytics.track"`)
   * @param payload - The payload to send (must have a `body` property)
   *
   * @example
   * ```typescript
   * ctx.tell('analytics.track', { body: { event: 'page.viewed', userId: 'u-42' } });
   * ```
   */
  tell: (action: ActionName, payload: CapTellPayload) => void;

  // ── Event emission ────────────────────────────────────────

  /**
   * Publishes an event to the CapsKit event bus.
   *
   * Events are routed to all subscribers that match the event name.
   * Subscriptions are declared in capsule manifests (`events.subscribes`)
   * or CapMeta (`events.subscribes`).
   *
   * @param event - Event name (e.g., `"order.placed"`, `"user.created"`)
   * @param data - Arbitrary event payload (must be serializable)
   *
   * @example
   * ```typescript
   * ctx.emit('order.placed', { orderId: 'ord-789', total: 42.99 });
   * ```
   */
  emit: (event: string, data: any) => void;

  // ── Typed capsule proxy ───────────────────────────────────

  /**
   * Returns a typed proxy for calling actions on a capsule directly.
   *
   * Prefer `ctx.invoke()` for explicit cross-capsule calls.
   * `ctx.use()` is a convenience for cases where you want IDE autocompletion
   * and type-safety when calling actions on a known capsule.
   *
   * @param capsuleName - Name of the capsule to proxy
   * @returns A typed proxy whose methods map to the capsule's actions
   *
   * @example
   * ```typescript
   * const users = ctx.use<UsersCapsule>('users');
   * const profile = await users.getProfile({ body: { id: 'u-42' } });
   * ```
   */
  use: <TCapsule = any>(capsuleName: string) => TCapsule;
}

/**
 * Payload shape for `ctx.invoke()` calls.
 * Mirrors {@link ActionInput} to maintain consistency with action handler signatures.
 */
export interface CapInvokePayload {
  /** The primary payload body for the target action */
  body: any;
  /** Optional route/path parameters */
  params?: any;
  /** Optional query parameters */
  query?: Record<string, any>;
}

/**
 * Payload shape for `ctx.tell()` calls.
 * Same structure as invoke payload, but the caller does not expect a response.
 */
export interface CapTellPayload {
  /** The primary payload body for the target action */
  body: any;
  /** Optional route/path parameters */
  params?: any;
  /** Optional query parameters */
  query?: Record<string, any>;
}

// ============================================================
// Cap Handler Signature
// ============================================================

/**
 * Signature for a Cap action handler method.
 *
 * Every public method on a Cap class is an action handler.
 * It receives the parsed input and the Cap execution context,
 * and returns a Promise resolving to the action's result.
 *
 * This type alias provides a convenient shorthand for declaring
 * Cap method signatures.
 *
 * @template TInput - The expected shape of `input.body`
 * @template TResult - The expected return type
 *
 * @example
 * ```typescript
 * type SumHandler = CapHandler<{ a: number; b: number }, { result: number }>;
 * // Equivalent to:
 * // (input: ActionInput, ctx: CapContext) => Promise<{ result: number }>
 * ```
 */
export type CapHandler<TInput = any, TResult = any> = (
  input: ActionInput,
  ctx: CapContext
) => Promise<TResult>;

// ============================================================
// CapClass Interface
// ============================================================

/**
 * Interface for cap business logic classes.
 * A Cap is a unit of business logic within a Capsule.
 * Cap classes must be instantiable (support `new`) and their
 * public methods serve as action handlers.
 *
 * Each action method receives an {@link ActionInput} and a {@link CapContext},
 * and must return a Promise resolving to the action's result.
 *
 * @example
 * ```typescript
 * class CalculatorCap implements CapClass {
 *   async sum(input: ActionInput, ctx: CapContext): Promise<{ result: number }> {
 *     const { a, b } = input.body;
 *     return { result: a + b };
 *   }
 *
 *   async multiply(input: ActionInput, ctx: CapContext): Promise<{ result: number }> {
 *     const { a, b } = input.body;
 *     return { result: a * b };
 *   }
 * }
 * ```
 */
export interface CapClass {
  /**
   * Action handler methods.
   * Each method name corresponds to an action name exposed by the cap.
   * Methods must be async and follow the CapHandler signature:
   * (input: ActionInput, context: CapContext) => Promise<any>
   */
  [action: string]: any;
}

/**
 * Per-action metadata for a Cap method.
 * Mirrors the non-handler fields of {@link ActionDefinition},
 * allowing cap authors to declare per-method validation, caching,
 * resiliency, and documentation.
 *
 * @example
 * ```typescript
 * export const meta: CapMeta = {
 *   name: 'calculator',
 *   actions: {
 *     sum: {
 *       description: 'Adds two numbers together',
 *       inputSchema: {
 *         type: 'object',
 *         properties: { a: { type: 'number' }, b: { type: 'number' } },
 *         required: ['a', 'b']
 *       }
 *     }
 *   }
 * };
 * ```
 */
export interface CapActionMeta {
  /** Human-readable description of what the action does */
  description?: string;
  /** Input validation schema (JSON Schema draft-07) */
  inputSchema?: ActionSchema;
  /** Output validation with optional strict mode */
  outputSchema?: OutputValidationOptions;
  /** @deprecated Use inputSchema instead */
  schema?: ActionSchema;
  /** Cache configuration for this action */
  cache?: CacheConfig;
  /** Resiliency configuration (fallback, circuit breaker) */
  resiliency?: ResiliencyConfig;
}

/**
 * Metadata contract for a Cap (the cap.meta.ts file).
 * Each Cap exports a CapMeta object describing its identity,
 * HTTP routes, event contracts, and dependencies.
 *
 * The CapMeta is the Cap-level equivalent of a CapsuleManifest,
 * providing the registry with the information needed to wire up
 * routes, events, dependency injection, and per-action behavior.
 *
 * @example
 * ```typescript
 * export const meta: CapMeta = {
 *   name: 'calculator',
 *   routes: [
 *     { method: 'POST', path: '/sum', action: 'sum' },
 *     { method: 'POST', path: '/multiply', action: 'multiply' }
 *   ],
 *   events: {
 *     publishes: ['calculator.sum.completed'],
 *     subscribes: [
 *       { event: 'numbers.received', action: 'sum' }
 *     ]
 *   },
 *   dependencies: ['math-utils'],
 *   actions: {
 *     sum: {
 *       description: 'Adds two numbers',
 *       inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] }
 *     }
 *   },
 *   boot: {
 *     init: async ({ deps }) => { await deps.database.connect(); }
 *   }
 * };
 * ```
 */
export interface CapMeta {
  /**
   * Unique cap identifier within the capsule.
   * Must be unique across all caps in the same capsule.
   */
  name: string;

  /**
   * Per-action metadata keyed by method/action name.
   * Each entry mirrors {@link ActionDefinition} (minus `handler`)
   * and is merged into the corresponding action during conversion.
   */
  actions?: Record<string, CapActionMeta>;

  /**
   * HTTP route definitions for this cap.
   * Each route maps an HTTP method and path to a cap action.
   */
  routes?: CapRoute[];

  /**
   * Event contract for this cap.
   * Defines which events the cap publishes and subscribes to.
   */
  events?: {
    /**
     * Event names this cap publishes.
     * Other caps or external systems can subscribe to these events.
     */
    publishes?: string[];

    /**
     * Event subscriptions that map incoming events to cap actions.
     */
    subscribes?: CapEventSubscription[];
  };

  /**
   * Names of external dependencies required by this cap.
   * These are resolved via the capsule's dependency injection container.
   */
  dependencies?: string[];

  /**
   * Boot lifecycle configuration for this cap.
   * Controls initialization during the capsule boot sequence.
   * When a CapsuleRegistry contains multiple caps, each cap's boot
   * config is merged: init functions run serially in cap order,
   * and the ready event name is scoped to the cap.
   */
  boot?: BootLifecycle;
}

/**
 * HTTP route definition for a cap.
 * Binds an HTTP method and URL path to a specific cap action.
 *
 * @example
 * ```typescript
 * const route: CapRoute = {
 *   method: 'POST',
 *   path: '/users/:id',
 *   action: 'getUser',
 *   traits: ['auth', 'rate-limit']
 * };
 * ```
 */
export interface CapRoute {
  /**
   * HTTP method for this route.
   * Supported methods align with the HTTP/1.1 specification.
   */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

  /**
   * URL path pattern for this route.
   * May include path parameters using colon-prefixed segments
   * (e.g., '/users/:id') or other route-pattern conventions
   * supported by the HTTP adapter.
   */
  path: string;

  /**
   * Name of the cap action to invoke when this route is matched.
   * Must correspond to a method name on the CapClass implementation.
   */
  action: string;

  /**
   * Optional trait names or configurations applied to this route.
   * Traits are cross-cutting concerns such as authentication,
   * rate-limiting, logging, or CORS that are applied as middleware.
   *
   * When specified as strings, each name references a registered
   * trait handler in the HTTP adapter.
   * When specified as objects, the key is the trait name and the
   * value is its configuration.
   */
  traits?: string[] | Record<string, any>;
}

/**
 * Event subscription mapping for a cap.
 * Binds an event name to a cap action that handles it.
 *
 * When the specified event is emitted on the platform,
 * the corresponding action is invoked automatically.
 *
 * @example
 * ```typescript
 * const subscription: CapEventSubscription = {
 *   event: 'user.created',
 *   action: 'sendWelcomeEmail'
 * };
 * ```
 */
export interface CapEventSubscription {
  /**
   * The event name to subscribe to.
   * Can be a namespaced event (e.g., 'capsule.action.completed')
   * or a simple event name.
   */
  event: string;

  /**
   * The name of the cap action that handles this event.
   * Must correspond to a method name on the CapClass implementation.
   */
  action: string;
}

/**
 * Pairs a Cap business logic class with its metadata.
 *
 * CapDefinition is the atomic building block for composing a Capsule.
 * Each definition bundles a {@link CapClass} constructor (the implementation)
 * with its {@link CapMeta} (declarative configuration: routes, events, dependencies).
 *
 * When the kernel boots a CapsuleRegistry, it iterates the `caps` array,
 * instantiates each CapClass, and wires its actions into the action registry
 * using the metadata from CapMeta.
 *
 * @template TCap - The specific CapClass implementation type, providing
 *                   intellisense for the cap's action methods.
 *
 * @example
 * ```typescript
 * import { CalculatorCap } from './calculator.cap';
 * import { calculatorMeta } from './calculator.cap.meta';
 *
 * const calcDef: CapDefinition<CalculatorCap> = {
 *   class: CalculatorCap,
 *   meta: calculatorMeta
 * };
 * ```
 */
export interface CapDefinition<TCap extends CapClass = CapClass> {
  /**
   * The CapClass constructor. Must be instantiable with `new`.
   * The kernel calls `new capDef.class()` and registers the resulting
   * instance's methods as action handlers.
   */
  class: new (...args: any[]) => TCap;

  /**
   * Metadata that describes this cap's identity, routes, events, and dependencies.
   * The kernel uses this metadata to:
   * - Register HTTP routes (method + path → action mapping)
   * - Wire event subscriptions (event name → action mapping)
   * - Validate and inject dependencies
   * - Resolve inter-cap references within the capsule
   */
  meta: CapMeta;
}

/**
 * Registry that composes a Capsule from its constituent Cap definitions.
 *
 * A CapsuleRegistry is the top-level entry point for defining a Capsule
 * using the Cap-based composition model. It groups related Caps (each a
 * {@link CapDefinition}) under a unique name, forming a deployable unit
 * of business capabilities.
 *
 * This is the preferred way to define new Capsules, replacing the legacy
 * flat {@link CapsuleManifest} for new development. The kernel's boot
 * sequence converts CapsuleRegistry entries into the internal CapsuleManifest
 * representation.
 *
 * @example
 * ```typescript
 * import { CapsuleRegistry } from '@mobtakronio/capskit';
 * import { CalculatorCap, calculatorMeta } from './caps/calculator';
 * import { ScientificCap, scientificMeta } from './caps/scientific';
 *
 * export const calculatorCapsule: CapsuleRegistry = {
 *   name: 'calculator',
 *   caps: [
 *     { class: CalculatorCap, meta: calculatorMeta },
 *     { class: ScientificCap, meta: scientificMeta },
 *   ]
 * };
 * ```
 */
export interface CapsuleRegistry {
  /**
   * Unique capsule name. Must be unique across all capsules registered
   * on the platform. This name is used for dependency resolution
   * (other capsules can `require: ['calculator']`) and for the
   * `capskit.use('calculator')` public API.
   */
  name: string;

  /**
   * Array of Cap definitions that compose this capsule.
   * Each entry pairs a CapClass constructor with its CapMeta,
   * forming the complete set of capabilities exposed by this capsule.
   *
   * The kernel processes caps in array order, so cap registration
   * follows the declared sequence. Caps within the same registry
   * can depend on each other (resolved via CapMeta.dependencies).
   */
  caps: CapDefinition[];
}

export interface CapsKitConfig {
  capsules?: CapsuleSource[];
  capsuleDirs?: string[]; // Deprecated: use 'capsules' array for explicit precedence
  dependencies?: Record<string, any>;
  boot?: {
    action: string;
    payload?: any;
  };
  /**
   * When enabled, emits console warnings when `capskit.call()` is used directly.
   * Useful for catching accidental usage of the internal API in application code.
   * 
   * The lint rule `@capskit/no-direct-call` provides the same check at lint time.
   * Enable this at runtime to catch issues that slip through linting.
   * 
   * @default false (warnings disabled by default for production)
   */
  warnOnDirectCall?: boolean;
}

export type CapsuleSource = 
  | { type: 'directory'; path: string }
  | { type: 'cap-directory'; path: string }
  | { type: 'caps-registry'; path: string }
  | { type: 'manifest'; manifest: CapsuleManifest }
  | { type: 'package'; name: string };

/**
 * Discriminated union representing the detected capsule format in a directory.
 * 
 * Used by the kernel boot pipeline to decide which loader strategy to use:
 * - `caps-registry`: Load via {@link loadCapsRegistry} (caps.ts exporting CapsuleRegistry)
 * - `cap-directories`: Load via {@link loadCapsFromDirectory} (scan for .cap subdirectories)
 * - `legacy-manifest`: Load via {@link loadCapsules} (manifest.ts exporting CapsuleManifest)
 * - `unknown`: No recognized capsule format found
 * 
 * @example
 * ```typescript
 * const format = detectCapsuleFormat('./src/my-capsule');
 * if (format.kind === 'caps-registry') {
 *   const registry = await loadCapsRegistry(format.dirPath);
 *   // ...
 * } else if (format.kind === 'legacy-manifest') {
 *   const manifests = await loadCapsules(format.dirPath);
 *   // ...
 * }
 * ```
 */
export type CapsuleFormatDetection =
  | {
      /** New-style capsule using a caps.ts registry file */
      kind: 'caps-registry';
      /** Absolute path to the capsule directory */
      dirPath: string;
      /** Whether caps.ts (or .js/.mjs/.cjs) was found */
      hasCapsTs: true;
      /** Whether .cap subdirectories were also found (may coexist) */
      hasCapDirs: boolean;
      /** Whether a legacy manifest.ts was also found (may coexist) */
      hasManifest: boolean;
    }
  | {
      /** New-style capsule using .cap subdirectories (no caps.ts registry) */
      kind: 'cap-directories';
      dirPath: string;
      hasCapsTs: false;
      hasCapDirs: true;
      hasManifest: boolean;
    }
  | {
      /** Old-style capsule using a manifest.ts file */
      kind: 'legacy-manifest';
      dirPath: string;
      hasCapsTs: false;
      hasCapDirs: false;
      hasManifest: true;
    }
  | {
      /** No recognized capsule format found in this directory */
      kind: 'unknown';
      dirPath: string;
      hasCapsTs: false;
      hasCapDirs: false;
      hasManifest: false;
    };

/**
 * Internal/Advanced API - use only when you need dynamic action resolution
 * or are building kernel-level functionality.
 * 
 * For application code, prefer `use().action()` instead.
 */
export interface ICapsKit {
  start(): Promise<any>;
  
  /**
   * INTERNAL API - Prefer `use('capsule').action()` for application code.
   * 
   * Direct action invocation by full action name (e.g., 'user.create').
   * Use this only when:
   * - Building kernel-level functionality or adapters
   * - Need dynamic action resolution (action name determined at runtime)
   * - Writing advanced introspection tools
   * 
   * For application code, use `capskit.use('capsule').action(payload)` instead.
   * 
   * @example
   * // Internal use (adapters, kernel)
   * const result = await capskit.call('system.getHealth', {});
   * 
   * @example
   * // Preferred application code pattern
   * const system = capskit.use('system');
   * const result = await system.getHealth({});
   */
  call(actionName: string, payload: any): Promise<any>;
  
  /**
   * PUBLIC API - The canonical way to interact with capsules.
   * 
   * Returns a typed proxy for calling actions on a capsule.
   * Provides better IDE support, type safety, and cleaner code.
   * 
   * @example
   * const users = capskit.use('users');
   * const user = await users.create({ email: 'test@example.com' });
   */
  use<TCapsule = any>(capsuleName: string): TCapsule;
  
  describe(capsuleName: string): CapsuleManifest | undefined;
  getManifests(): CapsuleManifest[];
  emit(event: string, data: any): void;
  addInterceptor(interceptor: ActionInterceptor): void;
}
