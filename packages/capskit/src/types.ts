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
   * Fallback behavior to use when the action fails.
   * If not provided, failures will surface normally.
   */
  fallback?: FallbackConfig;
  /**
   * Circuit breaker configuration to prevent repeated failing calls.
   * If not provided, circuit breaker is disabled for this action.
   */
  circuitBreaker?: CircuitBreakerConfig;
}

/**
 * Fallback configuration for when an action fails.
 */
export interface FallbackConfig {
  /**
   * The type of fallback: 'cache' or 'action'.
   * - 'cache': Return cached result from a previous successful call
   * - 'action': Call a different action as fallback
   */
  type: 'cache' | 'action';
  /**
   * For 'cache' type: maximum age of cached result to use (ms).
   * For 'action' type: the fallback action name (e.g., 'users.getCached').
   */
  value?: string | number;
}

/**
 * Circuit breaker configuration to prevent cascading failures.
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening the circuit.
   * When circuit is open, calls fail immediately without attempting handler.
   * 
   * @default 3
   */
  failureThreshold?: number;
  /**
   * Number of successful calls required to close a half-open circuit.
   * After opening, circuit enters half-open state and allows test calls.
   * 
   * @default 1
   */
  successThreshold?: number;
  /**
   * Time window in milliseconds to track consecutive failures.
   * Failures outside this window are not counted.
   * 
   * @default 60000 (60 seconds)
   */
  windowMs?: number;
  /**
   * Time in milliseconds to wait before transitioning from open to half-open.
   * During open state, all calls fail immediately.
   * 
   * @default 30000 (30 seconds)
   */
  resetTimeoutMs?: number;
}

/**
 * Circuit breaker state for a single action.
 */
export interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  nextResetTime: number | null; // When 'open' state should transition to 'half-open'
}

/**
 * Cached result entry with expiration.
 */
export interface CachedResult {
  result: any;
  timestamp: number;
  expiresAt: number | null; // null = never expires
}

/**
 * Schema contract types for action input/output validation.
 * Uses JSON Schema draft-07 compatible structure.
 */
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

/**
 * Interface for cap business logic classes.
 * A Cap is a unit of business logic within a Capsule.
 * Cap classes must be instantiable (support `new`) and their
 * public methods serve as action handlers.
 *
 * Each action method receives an {@link ActionInput} and an {@link ActionContext},
 * and must return a Promise resolving to the action's result.
 *
 * @example
 * ```typescript
 * class CalculatorCap implements CapClass {
 *   async sum(input: ActionInput, ctx: ActionContext): Promise<{ result: number }> {
 *     const { a, b } = input.body;
 *     return { result: a + b };
 *   }
 *
 *   async multiply(input: ActionInput, ctx: ActionContext): Promise<{ result: number }> {
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
   * Methods must be async and follow the ActionHandler signature:
   * (input: ActionInput, context: ActionContext) => Promise<any>
   */
  [action: string]: (input: ActionInput, context: ActionContext) => Promise<any>;
}

/**
 * Metadata contract for a Cap (the cap.meta.ts file).
 * Each Cap exports a CapMeta object describing its identity,
 * HTTP routes, event contracts, and dependencies.
 *
 * The CapMeta is the Cap-level equivalent of a CapsuleManifest,
 * providing the registry with the information needed to wire up
 * routes, events, and dependency injection.
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
 *   dependencies: ['math-utils']
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
  | { type: 'manifest'; manifest: CapsuleManifest }
  | { type: 'package'; name: string };

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
