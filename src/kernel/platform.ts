import { ActionHandler, ICapsKit, CapsKitConfig, CapsuleManifest, ActionInterceptor, ActionContext, ActionDefinition, CapsuleSource } from '../types';
import * as path from 'path';
import { loadCapsules } from './loader';
import { builtinCapsules } from '../capsules/builtin';
import { ValidationError, NotFoundError, DependencyError, AuthorizationError, TraitError } from './errors';

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
    // 1. Register built-in capsules (explicit list for packaging safety)
    for (const manifest of builtinCapsules) {
      if (!this.manifests.has(manifest.name)) {
        await this.registerCapsule(manifest, undefined);
      }
    }

    // 2. Process custom capsule sources with explicit precedence
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
        if (!handlerPath.startsWith(capsuleSource)) {
          throw new Error(`Handler path "${handler}" for action ${fullName} resolves outside capsule directory. ` +
            `This is a security restriction.`);
        }

        try {
          // Dynamic import the handler module
          const module = await import(`file://${handlerPath}`);

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
     if (!manifest.actions || typeof manifest.actions !== 'object') {
       throw new ValidationError(`Capsule "${manifest.name}" must have an actions object.`);
     }

     // Validate action definitions
     for (const [actionName, def] of Object.entries(manifest.actions)) {
       if (!def.handler) {
         throw new ValidationError(`Action "${manifest.name}.${actionName}" must have a handler.`);
       }
     }

     // Validate event subscriptions if present
     if (manifest.events?.subscribes) {
       if (!Array.isArray(manifest.events.subscribes)) {
         throw new ValidationError(`Capsule "${manifest.name}" events.subscribes must be an array.`);
       }
       for (const sub of manifest.events.subscribes) {
         if (typeof sub.event !== 'string' || typeof sub.action !== 'string') {
           throw new ValidationError(`Invalid event subscription in capsule "${manifest.name}": event and action must be strings.`);
         }
       }
     }

     // Validate event publishes if present
     if (manifest.events?.publishes) {
       if (!Array.isArray(manifest.events.publishes)) {
         throw new ValidationError(`Capsule "${manifest.name}" events.publishes must be an array.`);
       }
       for (const ev of manifest.events.publishes) {
         if (typeof ev !== 'string') {
           throw new ValidationError(`Invalid event name in capsule "${manifest.name}" publishes: must be string.`);
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

      // Validate input payload body against schema if defined
      if (actionDef.schema) {
        this.validatePayload(actionDef.schema, payload.body, actionName);
      }

      const handler = actionDef.handler as ActionHandler;

      const context: ActionContext = {
        params: payload?.params,
        body: payload?.body,
        query: payload?.query,
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
            await hook(payload, context);
          }
        }

        let result = await handler(payload, context);

        if (actionDef.post) {
          for (const hook of actionDef.post) {
            const hookResult = await hook(payload, result, context);
            if (hookResult !== undefined) {
              result = hookResult;
            }
          }
        }

        return result;
      }
      const interceptor = this.interceptors[i];
      return interceptor(actionName, payload, context, () => dispatch(i + 1));
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

