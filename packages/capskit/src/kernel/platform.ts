// Platform implementation - createCapsKit with HTTP router support

import * as fs from 'fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { convertRegistryToManifest, CapsuleRegistry, CapsuleManifest, CapLoadError } from './cap-loader';
import { ValidationError, AuthorizationError, toErrorEnvelope } from './errors';
import { redactPayload } from '../types';

function validateManifest(manifest: CapsuleManifest): void {
  if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    const err = new Error('Capsule manifest must have a non-empty name');
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }
  const VALID_NAME = /^[a-zA-Z0-9_-]+$/;
  if (!VALID_NAME.test(manifest.name)) {
    const err = new Error(`Capsule manifest has invalid name "${manifest.name}". Name must be alphanumeric, hyphens, and underscores only`);
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!manifest.actions || typeof manifest.actions !== 'object') {
    const err = new Error(`Capsule manifest "${manifest.name}" must have an actions object`);
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }
  for (const actionName of Object.keys(manifest.actions)) {
    if (!VALID_NAME.test(actionName)) {
      const err = new Error(`Capsule "${manifest.name}" has invalid action name "${actionName}". Action names must be alphanumeric, hyphens, and underscores only`);
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }
  }
}

function validateSchema(payload: unknown, schema: any, actionName: string): void {
  if (!schema) return;
  const body = (payload as any)?.body ?? payload;
  const fieldErrors: Array<{ field: string; constraint: string; message: string }> = [];

  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (body === null || body === undefined || !(field in body)) {
        fieldErrors.push({ field, constraint: 'required', message: `${field} is required` });
      }
    }
  }

  if (schema.properties && typeof body === 'object' && body !== null) {
    for (const [field, propSchema] of Object.entries(schema.properties)) {
      if (field in body) {
        const value = (body as any)[field];
        const s = propSchema as any;

        // Nullability
        if (value === null) {
          if (s?.nullable === true) {
            continue; // null is explicitly allowed
          } else {
            fieldErrors.push({ field, constraint: 'type', message: `Field "${field}" must not be null` });
            continue;
          }
        }

        // Type checks
        if (s?.type) {
          const expectedType = s.type;
          let typeOk = true;
          if (expectedType === 'array') {
            typeOk = Array.isArray(value);
          } else if (expectedType === 'integer') {
            typeOk = Number.isInteger(value);
          } else {
            typeOk = typeof value === expectedType;
          }
          if (!typeOk) {
            fieldErrors.push({ field, constraint: 'type', message: `Field "${field}" must be a ${expectedType}` });
          }
        }

        // Array items
        if (s?.type === 'array' && Array.isArray(value) && s?.items) {
          for (let i = 0; i < value.length; i++) {
            const item = value[i];
            const itemExpectedType = s.items.type;
            if (itemExpectedType) {
              let itemTypeOk = true;
              if (itemExpectedType === 'array') {
                itemTypeOk = Array.isArray(item);
              } else if (itemExpectedType === 'integer') {
                itemTypeOk = Number.isInteger(item);
              } else {
                itemTypeOk = typeof item === itemExpectedType;
              }
              if (!itemTypeOk) {
                fieldErrors.push({ field, constraint: 'type', message: `Item at index ${i} in "${field}" must be a ${itemExpectedType}` });
              }
            }
          }
        }

        // Enum
        if (s?.enum && Array.isArray(s.enum) && !s.enum.includes(value)) {
          fieldErrors.push({ field, constraint: 'enum', message: `\`"${field}"\` must be one of: ${s.enum.join(', ')}` });
        }

        // String constraints
        if (typeof value === 'string') {
          if (s?.minLength !== undefined && value.length < s.minLength) {
            fieldErrors.push({ field, constraint: 'minLength', message: `\`"${field}"\` must have length >= ${s.minLength}` });
          }
          if (s?.maxLength !== undefined && value.length > s.maxLength) {
            fieldErrors.push({ field, constraint: 'maxLength', message: `\`"${field}"\` must have length <= ${s.maxLength}` });
          }
          if (s?.pattern) {
            try {
              const re = new RegExp(s.pattern);
              if (!re.test(value)) {
                fieldErrors.push({ field, constraint: 'pattern', message: `\`"${field}"\` must match pattern: ${s.pattern}` });
              }
            } catch {
              // ignore invalid pattern regex
            }
          }
        }

        // Number constraints
        if (typeof value === 'number' || (s?.type === 'integer' && Number.isInteger(value))) {
          if (s?.minimum !== undefined && value < s.minimum) {
            fieldErrors.push({ field, constraint: 'minimum', message: `${field} must be >= ${s.minimum}` });
          }
          if (s?.maximum !== undefined && value > s.maximum) {
            fieldErrors.push({ field, constraint: 'maximum', message: `${field} must be <= ${s.maximum}` });
          }
        }

        // Format validations
        if (s?.format === 'email' && typeof value === 'string') {
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRe.test(value)) {
            fieldErrors.push({ field, constraint: 'format', message: `\`"${field}"\` must be a valid email` });
          }
        }
        if (s?.format === 'uri' && typeof value === 'string') {
          try {
            // eslint-disable-next-line no-new
            new URL(value);
          } catch {
            fieldErrors.push({ field, constraint: 'format', message: `\`"${field}"\` must be a valid URI` });
          }
        }
        if (s?.format === 'uuid' && typeof value === 'string') {
          const uuidRe = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
          if (!uuidRe.test(value)) {
            fieldErrors.push({ field, constraint: 'format', message: `\`"${field}"\` must be a valid UUID` });
          }
        }
        if (s?.format === 'date-time' && typeof value === 'string') {
          if (Number.isNaN(Date.parse(value))) {
            fieldErrors.push({ field, constraint: 'format', message: `\`"${field}"\` must be a valid date-time` });
          }
        }
      }
    }
  }

  if (schema.additionalProperties === false && typeof body === 'object' && body !== null) {
    const allowed = new Set([...(schema.required || []), ...Object.keys(schema.properties || {})]);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) {
        fieldErrors.push({ field: key, constraint: 'additionalProperties:false', message: `${key} is not allowed` });
      }
    }
  }

  if (fieldErrors.length > 0) {
    const reasons = fieldErrors.map(e => e.message);
    throw new ValidationError(`Validation failed for ${actionName}: ${reasons.join('; ')}`, { fieldErrors });
  }
}

export interface InternalState {
  capsules: Map<string, unknown>;
  caps: Map<string, unknown>;
  allCaps: Map<string, unknown>;
  dependencies: Record<string, string[]>;
  booted: boolean;
}

export interface CapsKitInstance {
  state: InternalState;
  call: (action: string, payload?: unknown) => Promise<unknown>;
  use: (capsuleName: string) => unknown;
  register: (capsule: unknown) => Promise<unknown>;
  shutdown: () => Promise<unknown>;
  boot: () => Promise<unknown>;
  describe: () => unknown;
  rpc: (action: string, payload?: unknown) => Promise<unknown>;
  getManifests: () => CapsuleManifest[];
  addInterceptor: (interceptor: (actionName: string, payload: any, context: any, next: any) => Promise<unknown>) => void;
  getDependencies: () => Record<string, unknown>;
}

interface CapsuleSource {
  type: 'directory' | 'manifest' | 'registry';
  path?: string;
  manifest?: CapsuleManifest;
  registry?: CapsuleRegistry;
}

export interface CreateCapsKitOptions {
  capsules?: CapsuleSource[];
  capsuleDirs?: string[];
  boot?: { action: string; payload?: Record<string, unknown> };
  dependencies?: Record<string, unknown>;
  warnOnDirectCall?: boolean;
}

async function loadCapsuleFromDir(dirPath: string): Promise<CapsuleRegistry | null> {
  const capsPath = path.join(dirPath, 'caps.ts');
  if (!fs.existsSync(capsPath)) return null;

  try {
    const mod = await import(capsPath);
    const registry = mod.default || Object.values(mod)[0];
    if (registry && registry.name && registry.caps) {
      return registry;
    }
  } catch {
    // Skip invalid
  }
  return null;
}

function createRouter(manifests: CapsuleManifest[], capskit: CapsKitInstance, executeAction: (action: string, payload?: unknown, existingCtx?: any) => Promise<unknown>, createExecutionContext: (inputOverride?: any, parentCtx?: any) => any): { handle: (request: Request) => Promise<Response> } {
  // Build a route map from manifests
  const routeMap = new Map<string, { method: string; handler: (...args: unknown[]) => Promise<unknown> }>();

  for (const manifest of manifests) {
    if (!manifest.actions) continue;
    for (const [actionName, actionDef] of Object.entries(manifest.actions)) {
      const routeKey = `${manifest.name}.${actionName}`;
      routeMap.set(routeKey, { method: 'POST', handler: async (...args: unknown[]) => actionDef.handler(...args) });
    }
  }

  // Build path-to-action mapping from routes
  const pathMap = new Map<string, { method: string; action: string; manifestName: string; handler: (...args: unknown[]) => Promise<unknown> }>();
  for (const manifest of manifests) {
    const routes = (manifest as unknown as Record<string, unknown>).routes as Array<{ method: string; path: string; action: string }> | undefined;
    if (routes) {
      for (const route of routes) {
        const actionDef = manifest.actions[route.action];
        if (actionDef?.handler) {
          const handler = actionDef.handler;
          pathMap.set(`${route.method}:${route.path}`, {
            method: route.method,
            action: route.action,
            manifestName: manifest.name,
            handler: async (...args: unknown[]) => handler(...args),
          });
        }
      }
    }
  }

  return {
    handle: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const key = `${request.method}:${url.pathname}`;
      const route = pathMap.get(key);

      if (!route) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }

      try {
        let body: Record<string, unknown> = {};
        if (request.body) {
          const contentType = request.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            body = await request.json();
          }
        }

        const platformCtx = createExecutionContext({
          body,
          params: {},
          query: Object.fromEntries(url.searchParams),
          deps: { capskit },
        });
        // Route-specific call uses executeAction for tracing
        platformCtx.call = async (action: string, payload?: unknown) => {
          return executeAction(action, payload, platformCtx);
        };

        const result = await executeAction(`${route.manifestName}.${route.action}`, { body, params: {}, query: Object.fromEntries(url.searchParams) }, platformCtx);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error: unknown) {
        // Error mapping
        if (error instanceof ValidationError) {
          return new Response(JSON.stringify({ error: error.message }), { status: 400 });
        }
        if (error instanceof AuthorizationError) {
          return new Response(JSON.stringify({ error: error.message }), { status: 403 });
        }
        if (error instanceof Error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
      }
    },
  };
}

export async function createCapsKit(options?: CreateCapsKitOptions): Promise<{ router: { handle: (request: Request) => Promise<Response> }; capskit: CapsKitInstance }> {
  const manifests: CapsuleManifest[] = [];
  const state: InternalState = {
    capsules: new Map(),
    caps: new Map(),
    allCaps: new Map(),
    dependencies: {},
    booted: false,
  };

  // Load from capsuleDirs
  if (options?.capsuleDirs) {
    for (const dir of options.capsuleDirs) {
      const registry = await loadCapsuleFromDir(dir);
      if (registry) {
        const manifest = convertRegistryToManifest(registry);
        validateManifest(manifest);
        manifests.push(manifest);
      }
    }
  }

  // Load from capsules array
  if (options?.capsules) {
    for (const source of options.capsules) {
      if (source.type === 'directory' && source.path) {
        const registry = await loadCapsuleFromDir(source.path);
        if (registry) {
          const manifest = convertRegistryToManifest(registry);
          validateManifest(manifest);
          manifests.push(manifest);
        }
      } else if (source.type === 'manifest' && source.manifest) {
        validateManifest(source.manifest);
        manifests.push(source.manifest);
      } else if (source.type === 'registry' && source.registry) {
        const manifest = convertRegistryToManifest(source.registry);
        validateManifest(manifest);
        manifests.push(manifest);
      }
    }
  }

  // Auto-load system capsule if not already loaded
  const hasSystem = manifests.some(m => m.name === 'system');
  if (!hasSystem) {
    const systemDir = path.resolve(__dirname, '..', 'capsules', 'system');
    const systemRegistry = await loadCapsuleFromDir(systemDir);
    if (systemRegistry) {
      const systemManifest = convertRegistryToManifest(systemRegistry);
      validateManifest(systemManifest);
      manifests.unshift(systemManifest); // Add system first
    }
  }

  // Check for duplicate capsule names
  const nameCounts = new Map<string, number>();
  for (const manifest of manifests) {
    nameCounts.set(manifest.name, (nameCounts.get(manifest.name) || 0) + 1);
  }
  const duplicates = [...nameCounts.entries()].filter(([_, count]) => count > 1).map(([name]) => name);
  if (duplicates.length > 0) {
    const err = new Error(`Duplicate capsule name(s): ${duplicates.join(', ')}`);
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }

  // Interceptors
  const interceptors: Array<(actionName: string, payload: any, context: any, next: any) => Promise<unknown>> = [];

  // Event system
  type EventHandler = (data: unknown) => void | Promise<void>;
  const eventListeners = new Map<string, EventHandler[]>();
  
  const emit = async (event: string, data: unknown) => {
    const handlers = eventListeners.get(event) || [];
    for (const handler of handlers) {
      await handler(data);
    }
  };
  
  const on = (event: string, handler: EventHandler) => {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, []);
    }
    eventListeners.get(event)!.push(handler);
  };
  
  const off = (event: string, handler: EventHandler) => {
    const handlers = eventListeners.get(event) || [];
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };

  const executeWithInterceptors = async (actionName: string, payload: unknown, context: unknown, handler: () => Promise<unknown>): Promise<unknown> => {
    if (interceptors.length === 0) return handler();
    
    let idx = 0;
    const next = async () => {
      if (idx >= interceptors.length) return handler();
      const interceptor = interceptors[idx++];
      return interceptor(actionName, payload, context, next);
    };
    return next();
  };

  // Circuit breaker state
  const circuitBreakerState = new Map<string, {
    failures: number;
    lastFailureTime: number | null;
    state: 'closed' | 'open' | 'half-open';
  }>();

  // Cache for fallback
  const cacheStore = new Map<string, { value: unknown; expiry: number }>();

  async function executeHandlerWithFallback(
    action: string,
    actionDef: any,
    payload: unknown,
    ctx: any,
    allManifests: CapsuleManifest[],
    callFn: (a: string, p?: unknown, c?: any) => Promise<unknown>,
    visited?: Set<string>,
  ): Promise<unknown> {
    const resiliency: { fallback?: any; circuitBreaker?: any } | undefined = actionDef.resiliency;

    // ----- Circuit breaker logic -----
    if (resiliency?.circuitBreaker) {
      const cb = resiliency.circuitBreaker;
      const failureThreshold = cb.failureThreshold ?? 5;
      const resetTimeoutMs = cb.resetTimeoutMs ?? 30000;
      let cbState = circuitBreakerState.get(action);
      if (!cbState) {
        cbState = { failures: 0, lastFailureTime: null, state: 'closed' };
        circuitBreakerState.set(action, cbState);
      }
      if (cbState.state === 'open') {
        if (cbState.lastFailureTime !== null && Date.now() - cbState.lastFailureTime >= resetTimeoutMs) {
          cbState.state = 'half-open';
        } else {
          const fb = resiliency?.fallback;
          if (fb) {
            return executeFallback(action, actionDef, payload, ctx, allManifests, callFn, visited);
          }
          throw new Error('Circuit breaker is open');
        }
      }
      if (cbState.state === 'half-open' && cb.successThreshold !== undefined) {
        // In half-open state, proceed with actual call and evaluate success
      }
    }

    try {
      const result = await actionDef.handler(payload, ctx);
      // On success, reset circuit breaker
      if (resiliency?.circuitBreaker) {
        const cbState = circuitBreakerState.get(action);
        if (cbState) {
          cbState.failures = 0;
          cbState.state = 'closed';
          cbState.lastFailureTime = null;
        }
      }
      // Cache result if cache fallback configured
      if (resiliency?.fallback?.type === 'cache') {
        const ttl = resiliency.fallback.cacheTtlMs ?? 30000;
        cacheStore.set(action, { value: result, expiry: Date.now() + ttl });
      }
      return result;
    } catch (err: unknown) {
      // Circuit breaker failure increment
      if (resiliency?.circuitBreaker) {
        const cb = resiliency.circuitBreaker;
        const failureThreshold = cb.failureThreshold ?? 5;
        let cbState = circuitBreakerState.get(action);
        if (!cbState) {
          cbState = { failures: 0, lastFailureTime: null, state: 'closed' };
          circuitBreakerState.set(action, cbState);
        }
        cbState.failures += 1;
        cbState.lastFailureTime = Date.now();
        if (cbState.failures >= failureThreshold) {
          cbState.state = 'open';
        }
      }

      // ----- Fallback logic -----
      return executeFallback(action, actionDef, payload, ctx, allManifests, callFn, visited, err);
    }
  }

  async function executeFallback(
    action: string,
    actionDef: any,
    payload: unknown,
    ctx: any,
    allManifests: CapsuleManifest[],
    callFn: (a: string, p?: unknown, c?: any) => Promise<unknown>,
    visited?: Set<string>,
    originalError?: unknown,
  ): Promise<unknown> {
    const fallback = actionDef.resiliency?.fallback;
    if (!fallback) {
      throw originalError ?? new Error('Action failed with no fallback');
    }

    if (fallback.type === 'action' && fallback.action === action) {
      throw new Error('Fallback action cannot be the same as the failing action');
    }

    if (visited) {
      if (visited.has(action)) {
        throw new Error('Circular fallback detected');
      }
    } else {
      visited = new Set<string>();
    }
    visited.add(action);

    if (fallback.type === 'action' && fallback.action) {
      const fallbackAction = fallback.action;
      // Locate manifest and actionDef for fallback
      let fbManifest: CapsuleManifest | undefined;
      let fbActionDef: any;
      if (fallbackAction.includes('.')) {
        const [fbCapsuleName, fbActionName] = fallbackAction.split('.');
        fbManifest = allManifests.find(m => m.name === fbCapsuleName);
        if (fbManifest) fbActionDef = fbManifest.actions[fbActionName];
      } else {
        for (const m of allManifests) {
          if (m.actions[fallbackAction]) {
            fbManifest = m;
            fbActionDef = m.actions[fallbackAction];
            break;
          }
        }
      }
      if (!fbActionDef) {
        throw new Error(`Fallback action "${fallbackAction}" not found`);
      }
      return executeHandlerWithFallback(fallbackAction, fbActionDef, payload, ctx, allManifests, callFn, visited);
    }

    if (fallback.type === 'cache') {
      const cached = cacheStore.get(action);
      if (cached && cached.expiry > Date.now()) {
        return cached.value;
      }
      // No fresh cache; proceed to throw original error so caller sees failure
      throw originalError ?? new Error('Action failed and cache miss');
    }

    throw originalError ?? new Error('Unknown fallback type');
  }

  // Dependencies object (capskit self-reference set after capskit is created)
  const mergedDeps: Record<string, unknown> = { ...(options?.dependencies || {}) };

  // Set up event subscriptions from manifests
  for (const manifest of manifests) {
    const events = (manifest as any).events;
    if (events?.subscribes) {
      for (const sub of events.subscribes) {
        const [capsuleName, actionName] = sub.action.includes('.') ? sub.action.split('.') : [manifest.name, sub.action];
        const targetManifest = manifests.find(m => m.name === capsuleName);
        if (targetManifest?.actions[actionName]) {
          const actionDef = targetManifest.actions[actionName];
          on(sub.event, async (data: unknown) => {
            const handler = actionDef.handler;
            const normalizedData =
              data && typeof data === 'object' && 'body' in (data as object)
                ? data
                : { body: data, params: {}, query: {} };
            await handler(normalizedData, { deps: mergedDeps, emit });
          });
        }
      }
    }
  }

  // Trace support
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

  function createInvokeProxy(thisCtx: any): any {
    const invokeFn = (action: string, payload?: unknown) => executeAction(action, payload, thisCtx);
    return new Proxy(invokeFn, {
      get(_target: any, capsuleName: string | symbol) {
        if (typeof capsuleName !== 'string') return undefined;
        return new Proxy({}, {
          get(_t2: any, actionName: string | symbol) {
            if (typeof actionName !== 'string') return undefined;
            return async (payload?: unknown) => executeAction(`${capsuleName}.${actionName}`, payload, thisCtx);
          }
        });
      },
      apply(_target: any, _thisArg: any, args: any[]) {
        const [action, payload] = args as [string, unknown?];
        return executeAction(action, payload, thisCtx);
      }
    });
  }

  function createTellProxy(thisCtx: any): any {
    const tellFn = (action: string, payload?: unknown) => {
      void executeAction(action, payload, thisCtx).catch((err: unknown) => {
        console.error(`Unhandled error in tell ${action}:`, err);
      });
    };
    return new Proxy(tellFn, {
      get(_target: any, capsuleName: string | symbol) {
        if (typeof capsuleName !== 'string') return undefined;
        return new Proxy({}, {
          get(_t2: any, actionName: string | symbol) {
            if (typeof actionName !== 'string') return undefined;
            return (payload?: unknown) => {
              void executeAction(`${capsuleName}.${actionName}`, payload, thisCtx).catch((err: unknown) => {
                console.error(`Unhandled error in tell ${capsuleName}.${actionName}:`, err);
              });
            };
          }
        });
      },
      apply(_target: any, _thisArg: any, args: any[]) {
        const [action, payload] = args as [string, unknown?];
        void executeAction(action, payload, thisCtx).catch((err: unknown) => {
          console.error(`Unhandled error in tell ${action}:`, err);
        });
      }
    });
  }

  function createExecutionContext(inputOverride?: any, parentCtx?: any): any {
    const ctx: any = parentCtx ? { ...parentCtx } : {
      deps: mergedDeps,
      emit,
      use: (capsuleName: string) => createCapsuleProxy(capsuleName),
      call: async (action: string, payload?: unknown) => {
        return executeAction(action, payload, ctx);
      },
      body: {},
      params: {},
      query: {},
    };
    if (!parentCtx) {
      ctx.invoke = createInvokeProxy(ctx);
      ctx.tell = createTellProxy(ctx);
    }
    if (inputOverride) {
      if ('body' in inputOverride) ctx.body = inputOverride.body;
      if ('params' in inputOverride) ctx.params = inputOverride.params;
      if ('query' in inputOverride) ctx.query = inputOverride.query;
      if ('deps' in inputOverride) ctx.deps = inputOverride.deps;
    }
    return ctx;
  }

  async function executeAction(action: string, payload?: unknown, existingCtx?: any): Promise<unknown> {
    const [capsuleName, actionName] = action.includes('.') ? action.split('.') : [null, action];
    const normalizedPayload =
      payload && typeof payload === 'object' && 'body' in payload
        ? payload
        : { body: payload, params: {}, query: {} };

    let manifest: CapsuleManifest | undefined;
    let actionDef: any;

    if (capsuleName) {
      manifest = manifests.find(m => m.name === capsuleName);
      if (manifest) actionDef = manifest.actions[actionName];
    }
    if (!actionDef) {
      for (const m of manifests) {
        if (m.actions[action]) {
          manifest = m;
          actionDef = m.actions[action];
          break;
        }
      }
    }

    if (!actionDef) {
      throw new Error(`Action not found: ${action}`);
    }

    const schema = (actionDef as any).schema || (actionDef as any).inputSchema;
    validateSchema(payload, schema, action);

    const executionCtx = createExecutionContext(normalizedPayload as any, existingCtx);

    const result = await withTracing(action, payload, async () => {
      return executeWithInterceptors(action, payload, executionCtx, async () => {
        return executeHandlerWithFallback(action, actionDef, normalizedPayload, executionCtx, manifests, executeAction);
      });
    });

    // Output schema validation
    const outputSchema = (actionDef as any).outputSchema;
    if (outputSchema?.strict) {
      const errors: Array<{ field: string; constraint: string; message: string }> = [];
      const schema = outputSchema.schema || outputSchema;
      if (schema?.properties) {
        for (const [field, propSchema] of Object.entries(schema.properties)) {
          const expectedType = (propSchema as any)?.type;
          if (expectedType && result && typeof result === 'object') {
            const actual = (result as any)[field];
            if (actual !== undefined) {
              let isValid = true;
              if (expectedType === 'integer') {
                isValid = Number.isInteger(actual);
              } else if (expectedType === 'array') {
                isValid = Array.isArray(actual);
              } else {
                isValid = typeof actual === expectedType;
              }
              if (!isValid) {
                errors.push({ field, constraint: 'type', message: `Output field "${field}" must be a ${expectedType}` });
              }
            }
          }
        }
      }
      if (errors.length > 0) {
        throw new ValidationError(`Output validation failed for ${action}`, { outputValidation: true, fieldErrors: errors });
      }
    }

    return result;
  }

  // Create proxy for use() method
  function createCapsuleProxy(capsuleName: string) {
    return new Proxy({}, {
      get: (_target, prop) => {
        const actionName = `${capsuleName}.${String(prop)}`;
        return async (payload: unknown) => {
          return executeAction(actionName, payload);
        };
      },
    });
  }

  // Create capskit instance
  const capskit: CapsKitInstance = {
    state,
    call: async (action: string, payload?: unknown) => {
      if (options?.warnOnDirectCall) {
        console.warn(`Warning: Direct call to "${action}" via capskit.call() is discouraged. Use capskit.use('<capsule>').<action>() instead.`);
      }
      return executeAction(action, payload);
    },
    use: (capsuleName: string) => createCapsuleProxy(capsuleName),
    register: async () => ({ status: 'registered' }),
    shutdown: async () => ({ status: 'shutdown' }),
    boot: async () => ({ status: 'booted' }),
    describe: () => ({ manifests: manifests.map(m => m.name) }),
    rpc: async (action: string, payload?: unknown) => capskit.call(action, payload),
    getManifests: () => manifests,
    addInterceptor: (interceptor) => { interceptors.push(interceptor); },
    getDependencies: () => mergedDeps,
  };
  
  // DI invariant: capskit always references itself (set after capskit object creation)
  mergedDeps.capskit = capskit;

  // Execute boot action if specified
  let router: { handle: (request: Request) => Promise<Response> } | undefined;
  
  if (options?.boot) {
    const bootAction = options.boot.action;
    // Try to find and execute the boot action
    for (const manifest of manifests) {
      if (manifest.actions[bootAction]) {
        const result = await manifest.actions[bootAction].handler(
          { body: options.boot.payload },
          { deps: { ...mergedDeps, allCaps: state.allCaps } },
        ) as { router?: { handle: (request: Request) => Promise<Response> } };
        if (result?.router) {
          router = result.router;
        }
      }
    }
  }

  // If no router was created by boot action, create a default one
  if (!router) {
    router = createRouter(manifests, capskit, executeAction, createExecutionContext);
  }

  return { router, capskit };
}
