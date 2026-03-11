import { ActionHandler, IPlatform, PlatformConfig, CapsuleManifest, ActionInterceptor, ActionContext } from '../types';
import * as path from 'path';
import { loadCapsules } from './loader';

export class Platform implements IPlatform {
  private actions = new Map<string, ActionHandler>();
  private manifests = new Map<string, CapsuleManifest>();
  private interceptors: ActionInterceptor[] = [];
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
        this.actions.set(fullName, definition.handler);
      } else {
        // In a real implementation, we would dynamic import here based on string path
        // For now, let's assume handlers are passed as functions in the manifest for simplicity in this iteration
        // or handled by the loader.
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
    const handler = this.actions.get(actionName);
    if (!handler) {
      throw new Error(`Action "${actionName}" not found.`);
    }

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
        return handler(payload, context);
      }
      const interceptor = this.interceptors[i];
      return interceptor(actionName, payload, context, () => dispatch(i + 1));
    };

    return dispatch(0);
  }

  emit(event: string, data: any): void {
    // Basic event emission (can be expanded with adapters later)
    console.log(`[Event] ${event}:`, data);
  }

  // Helper for internal registry access (used by system capsule later)
  getManifests() {
    return Array.from(this.manifests.values());
  }
}

export async function createPlatform(config: PlatformConfig): Promise<Platform> {
  return new Platform(config);
}
