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
  'refresh_token',
  'sessionId',
  'session_id',
  'privateKey',
  'private_key',
  'clientSecret',
  'client_secret',
] as const;

/**
 * Trace record schema for line-delimited JSON output.
 */
export interface TraceRecord {
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

export interface ActionDefinition {
  handler: string | ActionHandler;
  description?: string;
  pre?: ActionPreHook[];
  post?: ActionPostHook[];
  schema?: ActionSchema;
}

export interface ActionSchema {
  type: 'object';
  properties?: Record<string, any>;
  required?: string[];
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
