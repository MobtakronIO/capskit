import {
  ICapsKit, CapsKitConfig, CapsuleManifest, CapsuleSource, ActionInterceptor,
  ActionContext, ActionHandler, ResiliencyConfig, CircuitBreakerState, CapsuleFormatDetection,
  CacheAdapter,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { loadCapsules } from './loader';
import {
  loadCapsFromDirectory, convertCapsToManifests, loadCapsRegistriesFromDirectory,
  convertRegistriesToManifests, loadCapsRegistry, convertRegistryToManifest, detectCapsuleFormat,
} from './cap-loader';
import { createInvokeProxy, createTellProxy } from './invoke-proxy';
import { builtinCapsules } from '../capsules/builtin';
import { NotFoundError, InternalError, ValidationError } from './errors';
import { CacheMiddleware } from '../cache';
import { KernelState, resolveStringHandler } from './kernel-state';
import { validateManifestShape, validateManifestDependencies, validatePayload, validateOutput } from './validation';
import { traceCall, closeTraceSink } from './tracing';
import { validateFallbackChain } from './resiliency';
import { kernelLogger } from './logger';
import { createDrizzleFromEnv } from './db-bootstrap';

export class CapsKit implements ICapsKit {
  private capsuleSources = new Map<string, string>();
  private actionCallStack = new Set<string>();
  private circuitBreakerStates = new Map<string, CircuitBreakerState>();
  private fallbackCache = new Map<string, { result: any; timestamp: number; expiresAt: number | null }>();
  private eventRegistry = new Map<string, string[]>();
  private state: KernelState;
  private circuitBreakerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private config: CapsKitConfig;

  get manifests() { return this.state.manifests; }
  get actions() { return this.state.actions; }
  get dependencies() { return this.state.dependencies; }
  get cacheAdapter(): CacheAdapter | null { return this.state.cacheAdapter; }
  set cacheAdapter(adapter: CacheAdapter | null) { this.state.setCacheAdapter(adapter); }
  get interceptors() { return this.state.interceptors; }

  constructor(config: CapsKitConfig) {
    this.config = config;
    this.state = new KernelState();
    this.state.setDependency('capskit', this);
    if (config.dependencies) {
      for (const [key, value] of Object.entries(config.dependencies)) {
        if (key !== 'capskit') {
          this.state.setDependency(key, value);
        }
      }
    }
  }

  // ==========================================================================
  // STARTUP
  // ==========================================================================

  async start(): Promise<any> {
    // 1. Initialize Drizzle from env vars if CAPSKIT_DB_URL is set
    if (process.env.CAPSKIT_DB_URL) {
      const drizzle = await createDrizzleFromEnv();
      if (drizzle) {
        this.dependencies.drizzle = drizzle;
        kernelLogger.info('Drizzle ORM initialized');
      } else {
        kernelLogger.warn('CAPSKIT_DB_URL is set but Drizzle failed to initialize. Install drizzle-orm and the appropriate driver.');
      }
    }

    // 2. Accept injected cache adapter from config (cache is an injectable dependency)
    // The kernel does NOT auto-initialize cache. Users provide a CacheAdapter
    // via config.cacheAdapter or set capsKit.cacheAdapter before calling start().
    if (this.config.cacheAdapter) {
      this.cacheAdapter = this.config.cacheAdapter;
      kernelLogger.info('Cache adapter injected via config');
    }

    // 3. Register built-in capsules
    for (const manifest of builtinCapsules) {
      if (!this.manifests.has(manifest.name)) {
        await this.registerCapsule(manifest, undefined);
      }
    }

    // 4. Process custom capsule sources with explicit precedence
    const sources: CapsuleSource[] = [];

    if (this.config.capsules) {
      sources.push(...this.config.capsules);
    } else if (this.config.capsuleDirs) {
      for (const dir of this.config.capsuleDirs) {
        sources.push({ type: 'directory', path: dir });
      }
    }

    for (const source of sources) {
      await this.processSource(source);
    }

    // 5. Initialize cache middleware with registered actions
    if (this.cacheAdapter) {
      const cacheMiddleware = new CacheMiddleware(this.cacheAdapter, this.actions);
      this.interceptors.unshift(cacheMiddleware.createInterceptor());
    }

    // 6. Execute boot action if specified
    if (this.config.boot) {
      return await this.call(this.config.boot.action, this.config.boot.payload || {}, { fromUse: true });
    }

    return null;
  }

  // ==========================================================================
  // SOURCE PROCESSING
  // ==========================================================================

  /** Route a single CapsuleSource to the appropriate loader. */
  private async processSource(source: CapsuleSource): Promise<void> {
    switch (source.type) {
      case 'directory': {
        const absoluteDir = path.resolve(source.path);
        const rootFormat = detectCapsuleFormat(absoluteDir);

        if (rootFormat.kind !== 'unknown') {
          await this.loadCapsuleFromFormat(rootFormat, absoluteDir);
        } else {
          // Scan subdirectories
          if (fs.existsSync(absoluteDir)) {
            const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
            for (const entry of entries) {
              if (!entry.isDirectory()) continue;
              const subDir = path.resolve(absoluteDir, entry.name);
              const subFormat = detectCapsuleFormat(subDir);
              if (subFormat.kind === 'unknown') continue;
              await this.loadCapsuleFromFormat(subFormat, subDir);
            }
          }
        }
        break;
      }

      case 'cap-directory': {
        const absoluteDir = path.resolve(source.path);
        await this.loadCapsuleFromFormat(
          { kind: 'cap-directories', dirPath: absoluteDir, hasCapsTs: false, hasCapDirs: true, hasManifest: false },
          absoluteDir,
        );
        break;
      }

      case 'caps-registry': {
        const absoluteDir = path.resolve(source.path);
        await this.loadCapsuleFromFormat(
          { kind: 'caps-registry', dirPath: absoluteDir, hasCapsTs: true, hasCapDirs: false, hasManifest: false },
          absoluteDir,
        );
        break;
      }

      case 'manifest':
        await this.registerCapsule(source.manifest, undefined);
        break;

      case 'package': {
        try {
          const pkg = await import(source.name);
          let manifest: CapsuleManifest;
          if (pkg.service) {
            manifest = pkg.service;
          } else if (pkg.default && typeof pkg.default === 'object') {
            manifest = pkg.default as CapsuleManifest;
          } else {
            throw new Error(`Package ${source.name} does not export a CapsuleManifest as 'service' or default export.`);
          }
          await this.registerCapsule(manifest, undefined);
        } catch (error: any) {
          throw new Error(`Failed to load capsule package ${source.name}: ${error.message}`);
        }
        break;
      }
    }
  }

  /** Load a capsule from a detected format and register it. */
  private async loadCapsuleFromFormat(format: CapsuleFormatDetection, dirPath: string): Promise<void> {
    switch (format.kind) {
      case 'caps-registry': {
        const registry = await loadCapsRegistry(dirPath);
        if (registry) {
          const manifest = convertRegistryToManifest(registry);
          await this.registerCapsule(manifest, dirPath);
          kernelLogger.debug(`[boot] Registered capsule "${registry.name}" via caps.ts registry`);
        }
        break;
      }

      case 'cap-directories': {
        const capDefs = await loadCapsFromDirectory(dirPath);
        const manifests = convertCapsToManifests(capDefs);
        for (const manifest of manifests) {
          await this.registerCapsule(manifest, dirPath);
          kernelLogger.debug(`[boot] Registered capsule "${manifest.name}" via .cap directory`);
        }
        break;
      }

      case 'legacy-manifest': {
        const manifests = await loadCapsules(dirPath);
        for (const manifest of manifests) {
          const sourceDir = manifest['__capsuleDir'] as string | undefined;
          await this.registerCapsule(manifest, sourceDir || dirPath);
          kernelLogger.debug(`[boot] Registered capsule "${manifest.name}" via legacy manifest`);
        }
        break;
      }

      case 'unknown':
        kernelLogger.warn(
          `[boot] No recognized capsule format in "${dirPath}". ` +
          `Expected one of: caps.ts (registry), .cap subdirectories, or manifest.ts.`,
        );
        break;
    }
  }

  // ==========================================================================
  // CAPSULE REGISTRATION
  // ==========================================================================

  private async registerCapsule(manifest: CapsuleManifest, sourceDir?: string): Promise<void> {
    // Delegate to standalone validation functions
    validateManifestShape(manifest);
    validateManifestDependencies(manifest, this.dependencies);

    // Check for duplicate capsule name
    if (this.manifests.has(manifest.name)) {
      throw new Error(`Duplicate capsule name: ${manifest.name}`);
    }

    // Store capsule source directory if provided
    if (sourceDir) {
      this.capsuleSources.set(manifest.name, sourceDir);
    }

    this.manifests.set(manifest.name, manifest);

    // Process actions and resolve string handlers
    for (const [actionName, definition] of Object.entries(manifest.actions)) {
      const fullName = `${manifest.name}.${actionName}`;

      if (this.actions.has(fullName)) {
        throw new Error(`Duplicate action name: ${fullName}`);
      }

      let handler = definition.handler;

      // Resolve string-based handlers to actual functions
      if (typeof handler === 'string') {
        const capsuleSource = sourceDir || this.capsuleSources.get(manifest.name);
        if (!capsuleSource) {
          throw new Error(
            `Cannot resolve string handler for action ${fullName}: capsule source directory unknown. ` +
            `Capsule must be loaded from a filesystem path or have a source directory registered.`,
          );
        }

        const handlerPath = path.resolve(capsuleSource, handler);
        const relativePath = path.relative(capsuleSource, handlerPath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          throw new Error(
            `Handler path "${handler}" for action ${fullName} resolves outside capsule directory. ` +
            `This is a security restriction.`,
          );
        }

        try {
          let module;
          let lastError: Error | null = null;
          const extensions = path.extname(handlerPath) ? [''] : ['', '.js', '.mjs', '.cjs', '.ts'];

          for (const ext of extensions) {
            const candidatePath = ext ? handlerPath + ext : handlerPath;
            try {
              const fileUrl = pathToFileURL(candidatePath).href;
              module = await import(fileUrl);
              lastError = null;
              break;
            } catch (error: any) {
              lastError = error;
              if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'ENOENT') continue;
              throw error;
            }
          }

          if (lastError && !module) throw lastError;

          let resolvedHandler: ActionHandler;
          if (module.default && typeof module.default === 'function') {
            resolvedHandler = module.default;
          } else if (module[actionName] && typeof module[actionName] === 'function') {
            resolvedHandler = module[actionName];
          } else {
            throw new Error(
              `Module at "${handler}" does not export a function (default export or named export '${actionName}').`,
            );
          }

          definition.handler = resolvedHandler;
        } catch (error: any) {
          throw new Error(`Failed to load string handler "${handler}" for action ${fullName}: ${error.message}`);
        }
      }

      // Final check: handler must be a function
      if (typeof definition.handler !== 'function') {
        throw new Error(`Action ${fullName} has invalid handler type after resolution: ${typeof definition.handler}.`);
      }

      this.actions.set(fullName, definition);
    }

    // Register event subscriptions
    if (manifest.events?.subscribes) {
      for (const sub of manifest.events.subscribes) {
        if (!manifest.actions[sub.action]) {
          throw new ValidationError(
            `Capsule "${manifest.name}" subscribes to event "${sub.event}" with non-existent action "${sub.action}".`,
          );
        }
        const targetAction = `${manifest.name}.${sub.action}`;
        const existing = this.eventRegistry.get(sub.event) || [];
        existing.push(targetAction);
        this.eventRegistry.set(sub.event, existing);
      }
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  addInterceptor(interceptor: ActionInterceptor): void {
    this.interceptors.push(interceptor);
  }

  use<TCapsule = any>(capsuleName: string): TCapsule {
    const self = this;
    return new Proxy({}, {
      get: (_, actionName: string | symbol) => {
        return async (payload: any) => {
          const actionPath = `${capsuleName}.${String(actionName)}`;
          return self.call(actionPath, payload, { fromUse: true });
        };
      },
    }) as TCapsule;
  }

  describe(capsuleName: string): CapsuleManifest | undefined {
    return this.manifests.get(capsuleName);
  }

  /**
   * INTERNAL: Execute an action by full name.
   *
   * This is the core execution method. When warnOnDirectCall is enabled,
   * a warning is emitted when called directly (not via use() proxy).
   */
  async call(actionName: string, payload: any, { fromUse = false } = {}): Promise<any> {
    const caller = actionName.split('.')[0];

    return traceCall(actionName, payload, caller, async () => {
      // Warn if used directly instead of via use() proxy
      if (this.config.warnOnDirectCall && !fromUse) {
        kernelLogger.warn([
          `[CapsKit] Warning: Direct \`capskit.call('${actionName}', ...)\` usage detected.`,
          `  Prefer \`capskit.use('${actionName.split('.')[0]}').${actionName.split('.')[1]}(...)\` instead.`,
          `  The \`call()\` API is internal and may change without notice.`,
          `  To disable this warning, set \`warnOnDirectCall: false\` in createCapsKit config.`,
        ].join('\n'));
      }

      const actionDef = this.actions.get(actionName);
      if (!actionDef) {
        throw new NotFoundError(`Action "${actionName}" not found.`);
      }

      // Normalize payload
      const isStructured = payload && typeof payload === 'object' &&
        (payload.body !== undefined || payload.params !== undefined || payload.query !== undefined);
      const normalizedPayload = isStructured ? payload : { body: payload, params: undefined, query: {} };

      // Validate input payload body against schema
      const inputSchema = actionDef.inputSchema || actionDef.schema;
      if (inputSchema) {
        validatePayload(inputSchema, normalizedPayload.body, actionName);
      }

      const handler = actionDef.handler as ActionHandler;
      const resiliency = actionDef.resiliency;

      // --- Circuit Breaker Check ---
      if (resiliency?.circuitBreaker) {
        const state = this.getCircuitBreakerState(actionName, resiliency.circuitBreaker);
        if (state.status === 'open') {
          const cached = this.fallbackCache.get(actionName);
          if (cached) return cached.result;
          throw new InternalError(
            `Circuit breaker is open for action "${actionName}". Action temporarily unavailable.`,
          );
        }
      }

      // --- Fallback Loop Detection ---
      if (this.actionCallStack.has(actionName)) {
        throw new InternalError(
          `Circular fallback detected: action "${actionName}" is already being executed. ` +
          `Check your fallback configuration for cycles.`,
        );
      }

      const context: ActionContext = {
        params: normalizedPayload.params,
        body: normalizedPayload.body,
        query: normalizedPayload.query,
        deps: this.dependencies,
        emit: this.emit.bind(this),
        call: this.call.bind(this),
        use: this.use.bind(this),
        invoke: createInvokeProxy(this.call.bind(this)),
        tell: createTellProxy(this.call.bind(this)),
      };

      // --- Interceptor chain (onion model) ---
      let index = -1;
      const dispatch = async (i: number): Promise<any> => {
        if (i <= index) throw new Error('next() called multiple times');
        index = i;
        if (i === this.interceptors.length) {
          // Pre hooks
          if (actionDef.pre) {
            for (const hook of actionDef.pre) {
              await hook(normalizedPayload, context);
            }
          }

          let result = await handler(normalizedPayload, context);

          // Post hooks
          if (actionDef.post) {
            for (const hook of actionDef.post) {
              const hookResult = await hook(normalizedPayload, result, context);
              if (hookResult !== undefined) result = hookResult;
            }
          }

          // Output validation
          if (actionDef.outputSchema) {
            validateOutput(result, actionDef.outputSchema, actionName);
          }

          return result;
        }
        const interceptor = this.interceptors[i];
        return interceptor(actionName, normalizedPayload, context, () => dispatch(i + 1));
      };

      // --- Execute with Failure Handling ---
      try {
        this.actionCallStack.add(actionName);
        const result = await dispatch(0);

        // Cache successful result for fallback
        if (resiliency?.fallback?.type === 'cache') {
          const cacheTtlMs = resiliency.fallback.cacheTtlMs ?? Infinity;
          this.fallbackCache.set(actionName, {
            result,
            timestamp: Date.now(),
            expiresAt: cacheTtlMs === Infinity ? null : Date.now() + cacheTtlMs,
          });
        }
        this.recordSuccess(actionName, resiliency?.circuitBreaker);

        return result;
      } catch (error: any) {
        return await this.handleFailure(actionName, error, payload, resiliency);
      } finally {
        this.actionCallStack.delete(actionName);
      }
    });
  }

  emit(event: string, data: any): void {
    kernelLogger.debug(`Event emitted: ${event}`);
    const subscribers = this.eventRegistry.get(event);
    if (subscribers) {
      for (const actionName of subscribers) {
        this.call(actionName, data, { fromUse: true }).catch(err => {
          kernelLogger.error(`Subscriber action ${actionName} failed handling event ${event}:`, err);
        });
      }
    }
  }

  getDependencies(): Record<string, any> {
    return { ...this.dependencies };
  }

  getManifests() {
    return Array.from(this.manifests.values());
  }

  getCircuitStates(): Map<string, CircuitBreakerState> {
    return this.circuitBreakerStates;
  }

  /**
   * Gracefully shutdown the CapsKit instance.
   * Clears all pending timers, circuit breaker state, and delegates to KernelState shutdown.
   */
  shutdown(): void {
    for (const timer of this.circuitBreakerTimers.values()) {
      clearTimeout(timer);
    }
    this.circuitBreakerTimers.clear();
    this.circuitBreakerStates.clear();
    this.fallbackCache.clear();
    this.eventRegistry.clear();
    this.actionCallStack.clear();
    this.state.events.close();
    closeTraceSink();
    this.state.shutdown();
  }

  // ==========================================================================
  // CIRCUIT BREAKER (per-action state machine)
  // ==========================================================================

  private getCircuitBreakerState(
    actionName: string,
    config: NonNullable<ResiliencyConfig>['circuitBreaker'],
  ): CircuitBreakerState {
    let state = this.circuitBreakerStates.get(actionName);
    if (!state) {
      state = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        nextResetTime: null,
        status: 'closed',
      };
      this.circuitBreakerStates.set(actionName, state);
    }
    return state;
  }

  private recordSuccess(
    actionName: string,
    config?: NonNullable<ResiliencyConfig>['circuitBreaker'],
  ): void {
    if (!config) return;

    const state = this.getCircuitBreakerState(actionName, config);
    state.consecutiveFailures = 0;
    state.consecutiveSuccesses++;
    state.lastSuccessTime = Date.now();

    if (state.status === 'half-open') {
      if (state.consecutiveSuccesses >= (config.successThreshold ?? 1)) {
        state.status = 'closed';
      }
    }

    this.circuitBreakerStates.set(actionName, state);
  }

  private recordFailure(
    actionName: string,
    config?: NonNullable<ResiliencyConfig>['circuitBreaker'],
  ): void {
    if (!config) return;

    const state = this.getCircuitBreakerState(actionName, config);
    state.consecutiveFailures++;
    state.consecutiveSuccesses = 0;
    state.lastFailureTime = Date.now();

    if (state.consecutiveFailures >= (config.failureThreshold ?? 3)) {
      state.status = 'open';
      state.nextResetTime = Date.now() + (config.resetTimeoutMs ?? 30000);

      const existingTimer = this.circuitBreakerTimers.get(actionName);
      if (existingTimer) clearTimeout(existingTimer);

      const timerHandle = setTimeout(() => {
        const currentState = this.circuitBreakerStates.get(actionName);
        if (currentState && currentState.status === 'open') {
          currentState.status = 'half-open';
          currentState.consecutiveSuccesses = 0;
          this.circuitBreakerStates.set(actionName, currentState);
        }
        this.circuitBreakerTimers.delete(actionName);
      }, config.resetTimeoutMs ?? 30000);

      this.circuitBreakerTimers.set(actionName, timerHandle);
    }

    this.circuitBreakerStates.set(actionName, state);
  }

  // ==========================================================================
  // FAILURE HANDLING (fallback chain)
  // ==========================================================================

  private async handleFailure(
    actionName: string,
    error: any,
    payload: any,
    resiliency?: ResiliencyConfig,
  ): Promise<any> {
    this.recordFailure(actionName, resiliency?.circuitBreaker);

    if (!resiliency?.fallback) {
      throw error;
    }

    const { fallback } = resiliency;

    if (fallback.type === 'cache') {
      const cached = this.fallbackCache.get(actionName);
      if (cached) {
        const now = Date.now();
        const isExpired = cached.expiresAt !== null && now > cached.expiresAt;
        if (!isExpired) return cached.result;
      }
      throw error;
    }

    if (fallback.type === 'action') {
      const fallbackActionName = fallback.action;

      if (fallbackActionName === actionName) {
        throw new InternalError(`Fallback action cannot be the same as the primary action: "${actionName}".`);
      }

      const fallbackDef = this.actions.get(fallbackActionName!);
      if (!fallbackDef) {
        throw new NotFoundError(`Fallback action "${fallbackActionName}" not found.`);
      }

      return this.call(fallbackActionName!, payload, { fromUse: true });
    }

    throw error;
  }
}

/**
 * Create a CapsKit instance and boot it.
 * Returns boot results merged with the kit instance for convenience.
 */
export async function createCapsKit(config: CapsKitConfig): Promise<any> {
  const kit = new CapsKit(config);
  const bootResult = await kit.start();
  return Object.assign(bootResult || {}, { capskit: kit });
}
