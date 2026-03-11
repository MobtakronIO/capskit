import { ActionHandler, IPlatform, PlatformConfig, CapsuleManifest, ActionInterceptor, ActionContext, ActionDefinition } from '../types';
import * as path from 'path';
import { loadCapsules } from './loader';

export class Platform implements IPlatform {
  private actions = new Map<string, ActionDefinition>();
  private manifests = new Map<string, CapsuleManifest>();
  private interceptors: ActionInterceptor[] = [];
  private eventRegistry = new Map<string, string[]>();
  private dependencies: Record<string, any> = {};

  constructor(private config: PlatformConfig) {
    this.dependencies = {
      ...config.dependencies,
      platform: this
    };
  }

  async start(): Promise<void> {
    if (this.config.capsuleDirs) {
      for (const dir of this.config.capsuleDirs) {
        const absoluteDir = path.resolve(dir);
        const manifests = await loadCapsules(absoluteDir);
        
        for (const manifest of manifests) {
          this.registerCapsule(manifest);
        }
      }
    }
  }

  private registerCapsule(manifest: CapsuleManifest) {
    this.validateDependencies(manifest);
    this.manifests.set(manifest.name, manifest);

    for (const [actionName, definition] of Object.entries(manifest.actions)) {
      const fullName = `${manifest.name}.${actionName}`;
      if (typeof definition.handler === 'function') {
        this.actions.set(fullName, definition);
      } else {
        // In a real implementation, we would dynamic import here based on string path
      }
    }

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
          throw new Error(`Capsule "${manifest.name}" requires dependency "${dep}" which is not provided.`);
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
      throw new Error(`Action "${actionName}" not found.`);
    }

    const handler = actionDef.handler as ActionHandler;

    const context: ActionContext = {
      params: payload?.params,
      body: payload?.body,
      query: payload?.query,
      deps: this.dependencies,
      emit: this.emit.bind(this),
      call: this.call.bind(this)
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

  // Helper for internal registry access (used by system capsule later)
  getManifests() {
    return Array.from(this.manifests.values());
  }
}

export async function createPlatform(config: PlatformConfig): Promise<Platform> {
  return new Platform(config);
}
