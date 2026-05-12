import { ICapsKit, CapsKitConfig, CapsuleManifest, CapsuleSource, ActionInterceptor, ActionContext, ActionHandler, ResiliencyConfig, CircuitBreakerState } from '../types';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { loadCapsules } from './loader';
import { loadCapsFromDirectory, convertCapsToManifests, loadCapsRegistriesFromDirectory, convertRegistriesToManifests, loadCapsRegistry, convertRegistryToManifest } from './cap-loader';
import { builtinCapsules } from '../capsules/builtin';
import { NotFoundError, InternalError, ValidationError, DependencyError } from './errors';



import { CacheMiddleware, createCacheAdapter, parseCacheEnvDefault, CacheAdapter } from '../cache';
// Import kernel modules (extracted from platform.ts)
import { KernelState, validateDependencies, resolveStringHandler } from './kernel-state';
import { validateManifestShape, validateInput, validateOutput } from './validation';
import { traceCall, closeTraceSink } from './tracing';
import { validateFallbackChain } from './resiliency';
import { kernelLogger } from './logger';

/**
 * Safely extract default export from a dynamically imported module.
 * Handles both ESM ({ default: ... }) and CJS (direct export) interop.
 */
function getDefaultExport<T = unknown>(module: Record<string, unknown>): T {
  return ('default' in module ? module.default : module) as T;
}

/**
 * Pool configuration parsed from environment variables.
 * For Postgres (neon): passed to neon() config.
 * For SQLite: not applicable (synchronous, not pooled).
 */
interface PoolConfig {
  min?: number;
  max?: number;
  idleTimeout?: number;
  connectionTimeout?: number;
}

/**
 * Parse pool configuration from environment variables.
 */
function parsePoolConfig(): PoolConfig {
  const config: PoolConfig = {};
  
  const min = process.env.CAPSKIT_DB_POOL_MIN;
  if (min !== undefined) {
    const parsed = parseInt(min, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      config.min = parsed;
    }
  }
  
  const max = process.env.CAPSKIT_DB_POOL_MAX;
  if (max !== undefined) {
    const parsed = parseInt(max, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      config.max = parsed;
    }
  }
  
  const idleTimeout = process.env.CAPSKIT_DB_POOL_IDLE_TIMEOUT;
  if (idleTimeout !== undefined) {
    const parsed = parseInt(idleTimeout, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      config.idleTimeout = parsed;
    }
  }
  
  const connectionTimeout = process.env.CAPSKIT_DB_POOL_CONNECTION_TIMEOUT;
  if (connectionTimeout !== undefined) {
    const parsed = parseInt(connectionTimeout, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      config.connectionTimeout = parsed;
    }
  }
  
  return config;
}

/**
 * Construct a Drizzle instance from CAPSKIT_DB_* environment variables.
 * Supports Postgres (via @neondatabase/serverless) and SQLite (via better-sqlite3).
 * Returns undefined if packages are not installed or URL is not configured.
 */
async function createDrizzleFromEnv(): Promise<unknown> {
  const dbUrl = process.env.CAPSKIT_DB_URL;
  
  if (!dbUrl) {
    return undefined;
  }

  // Auto-detect provider from URL if not explicitly set
  const provider = process.env.CAPSKIT_DB_PROVIDER || 
    (dbUrl.startsWith('postgres') || dbUrl.startsWith('postgresql') ? 'postgres' : 'sqlite');

  // Parse pool configuration (used for Postgres; SQLite is synchronous and not pooled)
  const poolConfig = parsePoolConfig();
  const hasPoolConfig = Object.keys(poolConfig).length > 0;

  try {
    if (provider === 'postgres') {
      // Dynamic import for optional dependency
      const neonModule = await import('@neondatabase/serverless');
      const neon = getDefaultExport(neonModule) as (url: string, config?: { poolConfig?: PoolConfig }) => unknown;
      const drizzleModule = await import('drizzle-orm');

      // Pass pool configuration to neon if provided
      const sql = neon(dbUrl, hasPoolConfig ? { poolConfig } : undefined);

      // Create drizzle instance with Postgres
      const drizzle = ((drizzleModule as unknown) as Record<string, (db: unknown) => unknown>).drizzle;
      const drizzleInstance = drizzle(sql);

      return drizzleInstance;
    } else if (provider === 'sqlite') {
      // Note: SQLite via better-sqlite3 is synchronous and does not use connection pooling.
      // Pool settings (CAPSKIT_DB_POOL_*) are ignored for SQLite.
      if (hasPoolConfig) {
        kernelLogger.warn('Pool settings (CAPSKIT_DB_POOL_*) are not applicable for SQLite (better-sqlite3 is synchronous).');
      }

      // Dynamic import for optional dependency
      const betterSqlite3Module = await import('better-sqlite3');
      const drizzleModule2 = await import('drizzle-orm');

      // Safe access: better-sqlite3 may or may not have a default export depending on ESM/CJS interop
      const BetterSQLite3 = getDefaultExport(betterSqlite3Module) as new (path: string) => unknown;
      const db = new BetterSQLite3(dbUrl);
      const drizzle = ((drizzleModule2 as unknown) as Record<string, (db: unknown) => unknown>).drizzle;
      const drizzleInstance = drizzle(db);

      return drizzleInstance;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    kernelLogger.warn(`Failed to initialize ${provider} database: ${message}`);
    return undefined;
  }

  return undefined;
}

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

    // 1b. Initialize cache adapter based on CAPSKIT_CACHE_DEFAULT env var
    const cacheStorageType = parseCacheEnvDefault();
    try {
      const newAdapter = createCacheAdapter(cacheStorageType, {
        // Pass existing Redis client if available in dependencies
        redisClient: this.dependencies.redis,
      });
      if (newAdapter) this.cacheAdapter = newAdapter;
      kernelLogger.info(`Cache initialized: ${cacheStorageType}`);
    } catch (error: any) {
      kernelLogger.warn(`Cache initialization failed: ${error.message}. Falling back to memory.`);
      const memAdapter = createCacheAdapter('memory');
      if (memAdapter) this.cacheAdapter = memAdapter;
    }

    // 2. Register built-in capsules (explicit list for packaging safety)
    for (const manifest of builtinCapsules) {
      if (!this.manifests.has(manifest.name)) {
        await this.registerCapsule(manifest, undefined);
      }
    }

    // 3. Process custom capsule sources with explicit precedence
    const sources: CapsuleSource[] = [];

    if (this.config.capsules) {
      // New explicit sources array
      sources.push(...this.config.capsules);
    } else if (this.config.capsuleDirs) {
      // Backward compatibility: treat capsuleDirs as directory sources
      for (const dir of this.config.capsuleDirs) {
        sources.push({ type: 'directory', path: dir });
      }
    }

    // Process sources in defined order
    for (const source of sources) {
      if (source.type === 'directory') {
        const absoluteDir = path.resolve(source.path);
        const manifests = await loadCapsules(absoluteDir);
        for (const manifest of manifests) {
          const sourceDir = manifest['__capsuleDir'] as string | undefined;
          await this.registerCapsule(manifest, sourceDir);
        }
      } else if (source.type === 'cap-directory') {
        const absoluteDir = path.resolve(source.path);

        // Strategy: try caps.ts registry first, fall back to .cap directory scanning
        const registry = await loadCapsRegistry(absoluteDir);

        if (registry) {
          // caps.ts found — convert the single registry to a manifest
          const manifest = convertRegistryToManifest(registry);
          await this.registerCapsule(manifest, absoluteDir);
        } else {
          // No caps.ts — scan for .cap subdirectories (legacy cap-per-directory mode)
          const capDefs = await loadCapsFromDirectory(absoluteDir);
          const manifests = convertCapsToManifests(capDefs);
          for (const manifest of manifests) {
            await this.registerCapsule(manifest, absoluteDir);
          }
        }
      } else if (source.type === 'manifest') {
        await this.registerCapsule(source.manifest, undefined);
      } else if (source.type === 'package') {
        try {
          const pkg = await import(source.name);
          // Public capsule package convention: must export a CapsuleManifest as 'service' or default
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
      }
    }

    // 3b. Initialize cache middleware with registered actions
    if (this.cacheAdapter) {
      const cacheMiddleware = new CacheMiddleware(this.cacheAdapter, this.actions);
      // Prepend cache interceptor so it runs before other interceptors
      this.interceptors.unshift(cacheMiddleware.createInterceptor());
    }

    // 4. Execute boot action if specified
    // Boot is an internal use case - use internal call to avoid warning
    if (this.config.boot) {
      return await this.call(this.config.boot.action, this.config.boot.payload || {}, { fromUse: true });
    }

    return null;
  }

  private async registerCapsule(manifest: CapsuleManifest, sourceDir?: string): Promise<void> {
    // Validate manifest structure and required fields
    this.validateManifestShape(manifest);

    this.validateDependencies(manifest);

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

      // Check for duplicate action name across all capsules
      if (this.actions.has(fullName)) {
        throw new Error(`Duplicate action name: ${fullName}`);
      }

      let handler = definition.handler;

      // Resolve string-based handlers to actual functions
      if (typeof handler === 'string') {
        const capsuleSource = sourceDir || this.capsuleSources.get(manifest.name);
        if (!capsuleSource) {
          throw new Error(`Cannot resolve string handler for action ${fullName}: capsule source directory unknown. ` +
            `Capsule must be loaded from a filesystem path or have a source directory registered.`);
        }

        // Resolve path relative to capsule source directory
        const handlerPath = path.resolve(capsuleSource, handler);

        // Security check: ensure resolved path stays within capsule source
        // Use path.relative to properly check containment across different path styles
        const relativePath = path.relative(capsuleSource, handlerPath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          throw new Error(`Handler path "${handler}" for action ${fullName} resolves outside capsule directory. ` +
            `This is a security restriction.`);
        }

        try {
          // Try to import with extension resolution
          // First try the path as-is (in case it already has an extension or is a package)
          let module;
          let lastError: Error | null = null;
          
          // Generate potential file URLs with extensions
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
              // If file not found, continue to next extension
              if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'ENOENT') {
                continue;
              }
              // Other errors should be re-raised
              throw error;
            }
          }
          
          if (lastError && !module) {
            throw lastError;
          }

          // Try default export first, then named export matching action name
          let resolvedHandler: ActionHandler;
          if (module.default && typeof module.default === 'function') {
            resolvedHandler = module.default;
          } else if (module[actionName] && typeof module[actionName] === 'function') {
            resolvedHandler = module[actionName];
          } else {
            throw new Error(`Module at "${handler}" does not export a function (default export or named export '${actionName}').`);
          }

          // Replace string handler with resolved function
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
        // Validate that the subscribed action exists in this capsule
        if (!manifest.actions[sub.action]) {
          throw new ValidationError(`Capsule "${manifest.name}" subscribes to event "${sub.event}" with non-existent action "${sub.action}".`);
        }
        const targetAction = `${manifest.name}.${sub.action}`;
        const existing = this.eventRegistry.get(sub.event) || [];
        existing.push(targetAction);
        this.eventRegistry.set(sub.event, existing);
      }
    }
  }

   private validateDependencies(manifest: CapsuleManifest) {
     if (manifest.requires) {
       for (const dep of manifest.requires) {
         if (!this.dependencies[dep]) {
           throw new DependencyError(`Capsule "${manifest.name}" requires dependency "${dep}" which is not provided.`);
         }
       }
     }
   }

   private validateManifestShape(manifest: CapsuleManifest): void {
      // Required fields check
      if (!manifest.name) {
        throw new ValidationError('Capsule manifest must have a name.');
      }

      // Validate name format (alphanumeric, dashes, underscores)
      if (!/^[a-zA-Z0-9_-]+$/.test(manifest.name)) {
        throw new ValidationError(
          `Capsule "${manifest.name}" has an invalid name. ` +
          `Names must contain only alphanumeric characters, dashes, and underscores.`
        );
      }

      if (!manifest.actions || typeof manifest.actions !== 'object' || Array.isArray(manifest.actions)) {
        throw new ValidationError(`Capsule "${manifest.name}" must have an actions object.`);
      }

      // Check for empty actions
      const actionKeys = Object.keys(manifest.actions);
      if (actionKeys.length === 0) {
        throw new ValidationError(`Capsule "${manifest.name}" must have at least one action.`);
      }

      // Validate action definitions
      for (const [actionName, def] of Object.entries(manifest.actions)) {
        // Validate action name format
        if (!/^[a-zA-Z0-9_-]+$/.test(actionName)) {
          throw new ValidationError(
            `Action "${manifest.name}.${actionName}" has an invalid name. ` +
            `Action names must contain only alphanumeric characters, dashes, and underscores.`
          );
        }
        if (!def || typeof def !== 'object') {
          throw new ValidationError(`Action "${manifest.name}.${actionName}" must be an object with a handler.`);
        }
        if (!def.handler) {
          throw new ValidationError(`Action "${manifest.name}.${actionName}" must have a handler.`);
        }
        if (typeof def.handler !== 'string' && typeof def.handler !== 'function') {
          throw new ValidationError(
            `Action "${manifest.name}.${actionName}" has an invalid handler type. ` +
            `Handler must be a function or a string path to a module.`
          );
        }
      }

      // Validate requires if present
      if (manifest.requires !== undefined) {
        if (!Array.isArray(manifest.requires)) {
          throw new ValidationError(`Capsule "${manifest.name}" requires must be an array.`);
        }
        for (const dep of manifest.requires) {
          if (typeof dep !== 'string') {
            throw new ValidationError(`Capsule "${manifest.name}" has invalid requires entry: must be strings.`);
          }
        }
      }

      // Validate events structure if present
      if (manifest.events !== undefined) {
        if (typeof manifest.events !== 'object' || Array.isArray(manifest.events)) {
          throw new ValidationError(`Capsule "${manifest.name}" events must be an object.`);
        }

        // Validate event subscriptions if present
        if (manifest.events.subscribes !== undefined) {
          if (!Array.isArray(manifest.events.subscribes)) {
            throw new ValidationError(`Capsule "${manifest.name}" events.subscribes must be an array.`);
          }
          for (const sub of manifest.events.subscribes) {
            if (!sub || typeof sub !== 'object') {
              throw new ValidationError(`Invalid event subscription in capsule "${manifest.name}": must be an object with event and action.`);
            }
            if (typeof sub.event !== 'string' || !sub.event) {
              throw new ValidationError(`Invalid event subscription in capsule "${manifest.name}": event must be a non-empty string.`);
            }
            if (typeof sub.action !== 'string' || !sub.action) {
              throw new ValidationError(`Invalid event subscription in capsule "${manifest.name}": action must be a non-empty string.`);
            }
          }
        }

        // Validate event publishes if present
        if (manifest.events.publishes !== undefined) {
          if (!Array.isArray(manifest.events.publishes)) {
            throw new ValidationError(`Capsule "${manifest.name}" events.publishes must be an array.`);
          }
          for (const ev of manifest.events.publishes) {
            if (typeof ev !== 'string' || !ev) {
              throw new ValidationError(`Invalid event name in capsule "${manifest.name}" publishes: must be non-empty strings.`);
            }
          }
        }
      }
    }

  /**
   * Validates a payload against a JSON Schema.
   * Returns a ValidationResult with detailed field errors.
   * Throws ValidationError if validation fails.
   */
  private validatePayload(schema: any, payload: any, actionName: string): void {
      if (!schema) return;
      
      if (schema.type && schema.type !== 'object') {
        throw new ValidationError(`Schema type '${schema.type}' not supported for action ${actionName}. Only 'object' is supported.`);
      }
      
      const errors: any[] = [];
      
      // Check required fields
      if (schema.required && Array.isArray(schema.required)) {
        for (const key of schema.required) {
          if (payload?.[key] === undefined) {
            errors.push({
              field: key,
              message: `Field '${key}' is required`,
              constraint: 'required',
              value: undefined
            });
          }
        }
      }
      
      // Type and constraint validation against schema.properties
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          const value = payload?.[key];
          
          // Skip validation if value is undefined and field is not required
          if (value === undefined) {
            continue;
          }
          
          const prop = propSchema as any;
          if (!prop || typeof prop !== 'object') {
            continue;
          }
          
          // Type validation
          if (prop.type) {
            const expectedType = prop.type;
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            
            // Handle nullable
            if (prop.nullable && value === null) {
              // null is allowed
            } else if (expectedType === 'array') {
              if (!Array.isArray(value)) {
                errors.push({
                  field: key,
                  message: `Field '${key}' must be an array, got ${actualType}`,
                  constraint: `type:${expectedType}`,
                  value
                });
              }
            } else if (expectedType === 'integer') {
              if (typeof value !== 'number' || !Number.isInteger(value)) {
                errors.push({
                  field: key,
                  message: `Field '${key}' must be an integer, got ${actualType}`,
                  constraint: `type:${expectedType}`,
                  value
                });
              }
            } else if (expectedType !== actualType) {
              errors.push({
                field: key,
                message: `Field '${key}' must be of type ${expectedType}, got ${actualType}`,
                constraint: `type:${expectedType}`,
                value
              });
            }
          }
          
          // Format validation (only for strings)
          if (prop.format && typeof value === 'string') {
            if (prop.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              errors.push({
                field: key,
                message: `Field '${key}' must be a valid email address`,
                constraint: `format:${prop.format}`,
                value
              });
            } else if (prop.format === 'uri' && !/^https?:\/\//.test(value)) {
              errors.push({
                field: key,
                message: `Field '${key}' must be a valid URI`,
                constraint: `format:${prop.format}`,
                value
              });
            } else if (prop.format === 'date-time' && isNaN(Date.parse(value))) {
              errors.push({
                field: key,
                message: `Field '${key}' must be a valid ISO 8601 date-time string`,
                constraint: `format:${prop.format}`,
                value
              });
            } else if (prop.format === 'date' && isNaN(Date.parse(value))) {
              errors.push({
                field: key,
                message: `Field '${key}' must be a valid date string`,
                constraint: `format:${prop.format}`,
                value
              });
            } else if (prop.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
              errors.push({
                field: key,
                message: `Field '${key}' must be a valid UUID`,
                constraint: `format:${prop.format}`,
                value
              });
            }
          }
          
          // String constraints
          if (typeof value === 'string') {
            if (prop.minLength !== undefined && value.length < prop.minLength) {
              errors.push({
                field: key,
                message: `Field '${key}' must be at least ${prop.minLength} characters long`,
                constraint: `minLength:${prop.minLength}`,
                value
              });
            }
            if (prop.maxLength !== undefined && value.length > prop.maxLength) {
              errors.push({
                field: key,
                message: `Field '${key}' must be at most ${prop.maxLength} characters long`,
                constraint: `maxLength:${prop.maxLength}`,
                value
              });
            }
            if (prop.pattern) {
              const regex = new RegExp(prop.pattern);
              if (!regex.test(value)) {
                errors.push({
                  field: key,
                  message: `Field '${key}' does not match the required pattern`,
                  constraint: `pattern:${prop.pattern}`,
                  value
                });
              }
            }
          }
          
          // Number constraints
          if (typeof value === 'number') {
            if (prop.minimum !== undefined && value < prop.minimum) {
              errors.push({
                field: key,
                message: `Field '${key}' must be at least ${prop.minimum}`,
                constraint: `minimum:${prop.minimum}`,
                value
              });
            }
            if (prop.maximum !== undefined && value > prop.maximum) {
              errors.push({
                field: key,
                message: `Field '${key}' must be at most ${prop.maximum}`,
                constraint: `maximum:${prop.maximum}`,
                value
              });
            }
          }
          
          // Enum validation
          if (prop.enum && Array.isArray(prop.enum)) {
            if (!prop.enum.includes(value)) {
              errors.push({
                field: key,
                message: `Field '${key}' must be one of: ${prop.enum.join(', ')}`,
                constraint: `enum:${JSON.stringify(prop.enum)}`,
                value
              });
            }
          }
          
          // Array items validation
          if (prop.items && Array.isArray(value)) {
            const itemSchema = prop.items;
            for (let i = 0; i < value.length; i++) {
              const item = value[i];
              if (itemSchema.type) {
                const expectedItemType = itemSchema.type;
                const actualItemType = typeof item;
                
                if (expectedItemType === 'integer') {
                  if (typeof item !== 'number' || !Number.isInteger(item)) {
                    errors.push({
                      field: `${key}[${i}]`,
                      message: `Item at index ${i} in '${key}' must be an integer`,
                      constraint: `type:${expectedItemType}`,
                      value: item
                    });
                  }
                } else if (expectedItemType !== actualItemType) {
                  errors.push({
                    field: `${key}[${i}]`,
                    message: `Item at index ${i} in '${key}' must be of type ${expectedItemType}`,
                    constraint: `type:${expectedItemType}`,
                    value: item
                  });
                }
              }
            }
          }
        }
      }
      
      // Check additionalProperties
      if (schema.additionalProperties === false && schema.properties && payload && typeof payload === 'object') {
        const allowedKeys = new Set(Object.keys(schema.properties));
        for (const key of Object.keys(payload)) {
          if (!allowedKeys.has(key)) {
            errors.push({
              field: key,
              message: `Field '${key}' is not allowed. Allowed fields: ${Array.from(allowedKeys).join(', ')}`,
              constraint: 'additionalProperties:false',
              value: payload[key]
            });
          }
        }
      }
      
      // Throw validation error if any errors found
      if (errors.length > 0) {
        throw new ValidationError(
          `Input validation failed for action ${actionName}: ${errors.map(e => e.message).join('; ')}`,
          { fieldErrors: errors, action: actionName }
        );
      }
    }
    
    /**
     * Validates handler output against output schema.
     * Throws ValidationError if validation fails in strict mode.
     */
    private validateOutput(output: any, outputSchema: any, actionName: string): void {
      if (!outputSchema || !outputSchema.strict) {
        return;
      }
      
      const schema = outputSchema.schema;
      if (!schema) {
        return; // No schema to validate against
      }
      
      // Use validatePayload to check the output
      // We need to catch and re-throw with action context
      try {
        this.validatePayload(schema, output, actionName);
      } catch (error: any) {
        if (error.code === 'VALIDATION_ERROR') {
          // Re-throw with output context
          throw new ValidationError(
            `Output validation failed for action ${actionName}: ${error.message}`,
            { ...error.details, outputValidation: true }
          );
        }
        throw error;
      }
    }

  addInterceptor(interceptor: ActionInterceptor): void {
    this.interceptors.push(interceptor);
  }

    /**
     * INTERNAL: Execute an action by full name.
     * 
     * This is the core execution method. When warnOnDirectCall is enabled,
     * we emit a warning when called directly (not via use() proxy).
     * 
     * @internal
     */
    async call(actionName: string, payload: any, { fromUse = false } = {}): Promise<any> {
      // Determine caller capsule name for tracing
      const caller = actionName.split('.')[0];
      
      // Wrap with tracing - returns result first, then emits trace
      return traceCall(actionName, payload, caller, async () => {
        // Emit warning for direct external usage if configured
        if (this.config.warnOnDirectCall && !fromUse) {
          // Use a simple detection: if the caller is not within the kernel or use() proxy
          const warning = [
            `[CapsKit] Warning: Direct \`capskit.call('${actionName}', ...)\` usage detected.`,
            `  Prefer \`capskit.use('${actionName.split('.')[0]}').${actionName.split('.')[1]}(...)\` instead.`,
            `  The \`call()\` API is internal and may change without notice.`,
            `  To disable this warning, set \`warnOnDirectCall: false\` in createCapsKit config.`
          ].join('\n');
          kernelLogger.warn(warning);
        }

        const actionDef = this.actions.get(actionName);
        if (!actionDef) {
          throw new NotFoundError(`Action "${actionName}" not found.`);
        }

        // Normalize payload: support both structured (body/params/query) and plain objects
        const isStructured = payload && typeof payload === 'object' &&
          (payload.body !== undefined || payload.params !== undefined || payload.query !== undefined);
        const normalizedPayload = isStructured ? payload : { body: payload, params: undefined, query: {} };

        // Validate input payload body against schema if defined
        // Support both new inputSchema and deprecated schema for backward compatibility
        const inputSchema = actionDef.inputSchema || actionDef.schema;
        if (inputSchema) {
          this.validatePayload(inputSchema, normalizedPayload.body, actionName);
        }

        const handler = actionDef.handler as ActionHandler;
        const resiliency = actionDef.resiliency;

        // ============================================================
        // RESILIENCY: Circuit Breaker Check
        // ============================================================
        if (resiliency?.circuitBreaker) {
          const state = this.getCircuitBreakerState(actionName, resiliency.circuitBreaker);
          if (state.status === 'open') {
            // Fail fast - circuit is open
            const cached = this.fallbackCache.get(actionName);
            if (cached) {
              return cached.result;
            }
            throw new InternalError(`Circuit breaker is open for action "${actionName}". Action temporarily unavailable.`);
          }
        }

        // ============================================================
        // RESILIENCY: Fallback Loop Detection
        // ============================================================
        if (this.actionCallStack.has(actionName)) {
          throw new InternalError(`Circular fallback detected: action "${actionName}" is already being executed. Check your fallback configuration for cycles.`);
        }

        const context: ActionContext = {
          params: normalizedPayload.params,
          body: normalizedPayload.body,
          query: normalizedPayload.query,
          deps: this.dependencies,
          emit: this.emit.bind(this),
          call: this.call.bind(this),
          use: this.use.bind(this)
        };

        let index = -1;
        const dispatch = async (i: number): Promise<any> => {
          if (i <= index) throw new Error('next() called multiple times');
          index = i;
          if (i === this.interceptors.length) {
            
          if (actionDef.pre) {
            for (const hook of actionDef.pre) {
              await hook(normalizedPayload, context);
            }
          }

          let result = await handler(normalizedPayload, context);

          if (actionDef.post) {
            for (const hook of actionDef.post) {
              const hookResult = await hook(normalizedPayload, result, context);
              if (hookResult !== undefined) {
                result = hookResult;
              }
            }
          }

          // Validate output if outputSchema.strict is enabled
          if (actionDef.outputSchema) {
            this.validateOutput(result, actionDef.outputSchema, actionName);
          }

            return result;
          }
          const interceptor = this.interceptors[i];
          return interceptor(actionName, normalizedPayload, context, () => dispatch(i + 1));
        };

        // ============================================================
        // RESILIENCY: Execute with Failure Handling
        // ============================================================
        try {
          // Mark action as in-flight for loop detection
          this.actionCallStack.add(actionName);
          const result = await dispatch(0);
          
          // Success: record in cache if fallback-to-cache is enabled, update circuit breaker
          if (resiliency?.fallback?.type === 'cache') {
            const cacheTtlMs = resiliency.fallback.cacheTtlMs ?? Infinity;
            this.fallbackCache.set(actionName, {
              result,
              timestamp: Date.now(),
              expiresAt: cacheTtlMs === Infinity ? null : Date.now() + cacheTtlMs
            });
          }
          this.recordSuccess(actionName, resiliency?.circuitBreaker);
          
          return result;
        } catch (error: any) {
          // Failure: handle fallback
          // Use 'await' so finally runs AFTER handleFailure completes (ensuring proper stack tracking)
          return await this.handleFailure(actionName, error, payload, resiliency);
        } finally {
          // Always remove from in-flight stack
          this.actionCallStack.delete(actionName);
        }
      });
    }

    /**
     * Get or initialize circuit breaker state for an action.
     */
    private getCircuitBreakerState(actionName: string, config: NonNullable<ResiliencyConfig>['circuitBreaker']): CircuitBreakerState {
      let state = this.circuitBreakerStates.get(actionName);
      if (!state) {
        state = {
          consecutiveFailures: 0,
          consecutiveSuccesses: 0,
          lastFailureTime: null,
          lastSuccessTime: null,
          nextResetTime: null,
          status: 'closed'
        };
        this.circuitBreakerStates.set(actionName, state);
      }
      return state;
    }

    /**
     * Record a successful action execution.
     */
    private recordSuccess(actionName: string, config?: NonNullable<ResiliencyConfig>['circuitBreaker']): void {
      if (!config) return;
      
      const state = this.getCircuitBreakerState(actionName, config);
      state.consecutiveFailures = 0;
      state.consecutiveSuccesses++;
      state.lastSuccessTime = Date.now();
      
      // If circuit is half-open, check if we have enough successes to close it
      if (state.status === 'half-open') {
        if (state.consecutiveSuccesses >= (config.successThreshold ?? 1)) {
          state.status = 'closed';
        }
      }
      
      this.circuitBreakerStates.set(actionName, state);
    }

    /**
     * Record a failed action execution.
     */
    private recordFailure(actionName: string, config?: NonNullable<ResiliencyConfig>['circuitBreaker']): void {
      if (!config) return;
      
      const state = this.getCircuitBreakerState(actionName, config);
      state.consecutiveFailures++;
      state.consecutiveSuccesses = 0;
      state.lastFailureTime = Date.now();
      
      // Check if we should open the circuit
      if (state.consecutiveFailures >= (config.failureThreshold ?? 3)) {
        state.status = 'open';
        state.nextResetTime = Date.now() + (config.resetTimeoutMs ?? 30000);
        
        // Clear any existing timer for this action
        const existingTimer = this.circuitBreakerTimers.get(actionName);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        // Schedule transition to half-open after resetTimeoutMs
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

    /**
     * Handle action failure and apply fallback if configured.
     */
    private async handleFailure(actionName: string, error: any, payload: any, resiliency?: ResiliencyConfig): Promise<any> {
      // Record failure for circuit breaker
      this.recordFailure(actionName, resiliency?.circuitBreaker);

      if (!resiliency?.fallback) {
        // No fallback configured - re-throw the error
        throw error;
      }

      const { fallback } = resiliency;

      if (fallback.type === 'cache') {
        // Fallback to cached result
        const cached = this.fallbackCache.get(actionName);
        if (cached) {
          // Check if cache is still valid
          const now = Date.now();
          const isExpired = cached.expiresAt !== null && now > cached.expiresAt;
          if (!isExpired) {
            return cached.result;
          }
        }
        // Cache miss or expired - re-throw
        throw error;
      }

      if (fallback.type === 'action') {
        // Fallback to alternate action
        const fallbackActionName = fallback.action;
        
        // Validate fallback action exists and is different to avoid immediate loop
        if (fallbackActionName === actionName) {
          throw new InternalError(`Fallback action cannot be the same as the primary action: "${actionName}".`);
        }

        // Verify fallback action exists
        const fallbackDef = this.actions.get(fallbackActionName!);
        if (!fallbackDef) {
          throw new NotFoundError(`Fallback action "${fallbackActionName}" not found.`);
        }

        // Execute fallback action recursively (loop detection will catch any cycles)
        return this.call(fallbackActionName!, payload, { fromUse: true });
      }

      // Unknown fallback type - re-throw
      throw error;
    }

  use<TCapsule = any>(capsuleName: string): TCapsule {
    const self = this;
    return new Proxy({}, {
      get: (_, actionName: string | symbol) => {
        return async (payload: any) => {
          const actionPath = `${capsuleName}.${String(actionName)}`;
          // Mark as internal call to suppress warning
          return self.call(actionPath, payload, { fromUse: true });
        };
      }
    }) as TCapsule;
  }

  describe(capsuleName: string): CapsuleManifest | undefined {
    return this.manifests.get(capsuleName);
  }

  emit(event: string, data: any): void {
    // Basic event emission (can be expanded with adapters later)
    kernelLogger.debug(`Event emitted: ${event}`);
    
    // Asynchronously dispatch to all registered subscribers
    const subscribers = this.eventRegistry.get(event);
    if (subscribers) {
      for (const actionName of subscribers) {
        // Fire and forget, but catch errors to avoid unhandled promises
        // Use internal call to avoid triggering warnings for internal event dispatch
        this.call(actionName, data, { fromUse: true }).catch(err => {
          kernelLogger.error(`Subscriber action ${actionName} failed handling event ${event}:`, err);
        });
      }
    }
  }

  // Read-only dependencies for introspection (tests, diagnostics)
  getDependencies(): Record<string, any> {
    return { ...this.dependencies };
  }

  // Helper for internal registry access (used by system capsule later)
  getManifests() {
    return Array.from(this.manifests.values());
  }

  /**
   * Gracefully shutdown the CapsKit instance.
   * Clears all pending timers, circuit breaker state, and delegates to KernelState shutdown.
   */
  shutdown(): void {
    // Clear all pending circuit breaker timers
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
}

export async function createCapsKit(config: CapsKitConfig): Promise<any> {
  const kit = new CapsKit(config);
  const bootResult = await kit.start();
  
  // Return boot results merged with the kit instance for convenience
  return Object.assign(bootResult || {}, { capskit: kit });
}

