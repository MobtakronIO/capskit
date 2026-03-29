import { ActionHandler, ICapsKit, CapsKitConfig, CapsuleManifest, ActionInterceptor, ActionContext, ActionDefinition, CapsuleSource } from '../types';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { loadCapsules } from './loader';
import { builtinCapsules } from '../capsules/builtin';
import { ValidationError, NotFoundError, DependencyError, AuthorizationError, TraitError } from './errors';

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
      const { default: neon } = await import('@neondatabase/serverless');
      const drizzle = await import('drizzle-orm');

      // Pass pool configuration to neon if provided
      const sql = neon(dbUrl, hasPoolConfig ? { poolConfig } : undefined);

      // Create drizzle instance with Postgres
      const drizzleInstance = drizzle.drizzle(sql);

      return drizzleInstance;
    } else if (provider === 'sqlite') {
      // Note: SQLite via better-sqlite3 is synchronous and does not use connection pooling.
      // Pool settings (CAPSKIT_DB_POOL_*) are ignored for SQLite.
      if (hasPoolConfig) {
        console.warn('[Drizzle] Pool settings (CAPSKIT_DB_POOL_*) are not applicable for SQLite (better-sqlite3 is synchronous).');
      }

      // Dynamic import for optional dependency
      const betterSqlite3Module = await import('better-sqlite3');
      const drizzle = await import('drizzle-orm');

      // Safe access: better-sqlite3 may or may not have a default export depending on ESM/CJS interop
      const BetterSQLite3 = ('default' in betterSqlite3Module 
        ? betterSqlite3Module.default 
        : betterSqlite3Module) as typeof import('better-sqlite3');
      const db = new BetterSQLite3(dbUrl);
      const drizzleInstance = drizzle.drizzle(db);

      return drizzleInstance;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Drizzle] Failed to initialize ${provider} database: ${message}`);
    return undefined;
  }

  return undefined;
}

export class CapsKit implements ICapsKit {
  private actions = new Map<string, ActionDefinition>();
  private manifests = new Map<string, CapsuleManifest>();
  private interceptors: ActionInterceptor[] = [];
  private eventRegistry = new Map<string, string[]>();
  private dependencies: Record<string, any> = {};
  private capsuleSources = new Map<string, string>(); // capsule name -> source directory

  constructor(private config: CapsKitConfig) {
    this.dependencies = {
      ...config.dependencies,
      capskit: this
    };
  }

  async start(): Promise<any> {
    // 1. Initialize Drizzle from env vars if CAPSKIT_DB_URL is set
    if (process.env.CAPSKIT_DB_URL) {
      const drizzle = await createDrizzleFromEnv();
      if (drizzle) {
        this.dependencies.drizzle = drizzle;
        console.log('[CapsKit] Drizzle ORM initialized');
      } else {
        console.warn('[CapsKit] CAPSKIT_DB_URL is set but Drizzle failed to initialize. Install drizzle-orm and the appropriate driver.');
      }
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
          const sourceDir = (manifest as any).__capsuleDir;
          await this.registerCapsule(manifest, sourceDir);
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

    // 3. Execute boot action if specified
    if (this.config.boot) {
      return await this.call(this.config.boot.action, this.config.boot.payload || {});
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

      // Check for duplicate action keys (JS silently overwrites duplicates with same name)
      const uniqueKeys = new Set(actionKeys);
      if (actionKeys.length !== uniqueKeys.size) {
        const duplicates = actionKeys.filter((key, index) => actionKeys.indexOf(key) !== index);
        throw new ValidationError(`Capsule "${manifest.name}" has duplicate action keys: ${[...new Set(duplicates)].join(', ')}`);
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

  private validatePayload(schema: any, payload: any, actionName: string): void {
      if (!schema) return;
      
      if (schema.type !== 'object') {
        throw new ValidationError(`Schema type '${schema.type}' not supported for action ${actionName}. Only 'object' is supported.`);
      }
      
      if (schema.required) {
        for (const key of schema.required) {
          if (payload?.[key] === undefined) {
            throw new ValidationError(`Action ${actionName} requires field '${key}' in payload.`);
          }
        }
      }
      
      // Type validation against schema.properties
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          const value = payload?.[key];
          if (value !== undefined && propSchema && typeof propSchema === 'object' && 'type' in propSchema) {
            const expectedType = (propSchema as any).type;
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            
            if (expectedType === 'array') {
              if (!Array.isArray(value)) {
                throw new ValidationError(`Action ${actionName} field '${key}' must be an array, got ${actualType}.`);
              }
            } else if (expectedType !== actualType) {
              throw new ValidationError(`Action ${actionName} field '${key}' must be ${expectedType}, got ${actualType}.`);
            }
          }
        }
      }
    }

  addInterceptor(interceptor: ActionInterceptor): void {
    this.interceptors.push(interceptor);
  }

    async call(actionName: string, payload: any): Promise<any> {
      const actionDef = this.actions.get(actionName);
      if (!actionDef) {
        throw new NotFoundError(`Action "${actionName}" not found.`);
      }

      // Normalize payload: support both structured (body/params/query) and plain objects
      const isStructured = payload && typeof payload === 'object' &&
        (payload.body !== undefined || payload.params !== undefined || payload.query !== undefined);
      const normalizedPayload = isStructured ? payload : { body: payload, params: undefined, query: {} };

      // Validate input payload body against schema if defined
      if (actionDef.schema) {
        this.validatePayload(actionDef.schema, normalizedPayload.body, actionName);
      }

      const handler = actionDef.handler as ActionHandler;

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

          return result;
        }
        const interceptor = this.interceptors[i];
        return interceptor(actionName, normalizedPayload, context, () => dispatch(i + 1));
    };

    return dispatch(0);
  }

  use<TCapsule = any>(capsuleName: string): TCapsule {
    return new Proxy({}, {
      get: (_, actionName: string | symbol) => {
        return async (payload: any) => {
          const actionPath = `${capsuleName}.${String(actionName)}`;
          return this.call(actionPath, payload);
        };
      }
    }) as TCapsule;
  }

  describe(capsuleName: string): CapsuleManifest | undefined {
    return this.manifests.get(capsuleName);
  }

  emit(event: string, data: any): void {
    // Basic event emission (can be expanded with adapters later)
    console.log(`[Event Bus] Emitted: ${event}`);
    
    // Asynchronously dispatch to all registered subscribers
    const subscribers = this.eventRegistry.get(event);
    if (subscribers) {
      for (const actionName of subscribers) {
        // Fire and forget, but catch errors to avoid unhandled promises
        this.call(actionName, data).catch(err => {
          console.error(`[Event Bus] Subscriber action ${actionName} failed handling event ${event}:`, err);
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
}

export async function createCapsKit(config: CapsKitConfig): Promise<any> {
  const kit = new CapsKit(config);
  const bootResult = await kit.start();
  
  // Return boot results merged with the kit instance for convenience
  return Object.assign(bootResult || {}, { capskit: kit });
}

