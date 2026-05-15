/**
 * Kernel state management for CapsKit.
 * Provides encapsulation for internal kernel state.
 */

import {
  CapsuleManifest,
  ActionDefinition,
  ActionInterceptor,
  CacheAdapter,
} from '../types';
import { EventRegistry } from './events';
import { ResiliencyManager } from './resiliency';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { DependencyError } from './errors';

/**
 * Kernel internal state.
 * Private to the kernel, not exposed through public API.
 */
export class KernelState {
  private _actions = new Map<string, ActionDefinition>();
  private _manifests = new Map<string, CapsuleManifest>();
  private _capsuleSources = new Map<string, string>();
  private _interceptors: ActionInterceptor[] = [];
  private _dependencies: Record<string, any> = {};
  private _cacheAdapter: CacheAdapter | null = null;

  readonly events: EventRegistry;
  readonly resiliency: ResiliencyManager;

  constructor() {
    this.events = new EventRegistry();
    this.resiliency = new ResiliencyManager();
  }

  get actions(): Map<string, ActionDefinition> { return this._actions; }
  get manifests(): Map<string, CapsuleManifest> { return this._manifests; }
  get interceptors(): ActionInterceptor[] { return this._interceptors; }
  get dependencies(): Record<string, any> { return this._dependencies; }
  get cacheAdapter() { return this._cacheAdapter; }

  hasAction(actionName: string): boolean { return this._actions.has(actionName); }
  getAction(actionName: string): ActionDefinition | undefined { return this._actions.get(actionName); }
  setAction(actionName: string, definition: ActionDefinition): void { this._actions.set(actionName, definition); }

  hasManifest(capsuleName: string): boolean { return this._manifests.has(capsuleName); }
  getManifest(capsuleName: string): CapsuleManifest | undefined { return this._manifests.get(capsuleName); }
  setManifest(capsuleName: string, manifest: CapsuleManifest): void { this._manifests.set(capsuleName, manifest); }

  getCapsuleSource(capsuleName: string): string | undefined { return this._capsuleSources.get(capsuleName); }
  setCapsuleSource(capsuleName: string, sourceDir: string): void { this._capsuleSources.set(capsuleName, sourceDir); }

  addInterceptor(interceptor: ActionInterceptor): void { this._interceptors.push(interceptor); }
  setDependency(key: string, value: any): void { this._dependencies[key] = value; }
  hasDependency(key: string): boolean { return key in this._dependencies; }
  setCacheAdapter(adapter: CacheAdapter | null): void { this._cacheAdapter = adapter; }

  shutdown(): void {
    this.resiliency.shutdown();
    this._actions.clear();
    this._manifests.clear();
    this._capsuleSources.clear();
    this._interceptors = [];
    this._cacheAdapter = null;
  }
}


/**
 * Validate dependencies for a capsule manifest.
 */
export function validateDependencies(state: KernelState, manifest: CapsuleManifest): void {
  if (manifest.requires) {
    for (const dep of manifest.requires) {
      if (!state.hasDependency(dep)) {
        throw new DependencyError(
          `Capsule "${manifest.name}" requires dependency "${dep}" which is not provided.`
        );
      }
    }
  }
}

/**
 * Resolve string handler to actual function.
 */
export async function resolveStringHandler(
  state: KernelState,
  capsuleName: string,
  actionName: string,
  handler: string
): Promise<import('../types').ActionHandler> {
  const capsuleSource = state.getCapsuleSource(capsuleName);
  if (!capsuleSource) {
    throw new Error(
      `Cannot resolve string handler for action ${capsuleName}.${actionName}: ` +
      `capsule source directory unknown. Capsule must be loaded from a filesystem path.`
    );
  }

  const handlerPath = path.resolve(capsuleSource, handler);

  // Security check: ensure resolved path stays within capsule source
  const relativePath = path.relative(capsuleSource, handlerPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(
      `Handler path "${handler}" for action ${capsuleName}.${actionName} resolves outside capsule directory. ` +
      `This is a security restriction.`
    );
  }

  try {
    let module: any;
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
        if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'ENOENT') {
          continue;
        }
        throw error;
      }
    }

    if (lastError && !module) {
      throw lastError;
    }

    // Try default export first, then named export matching action name
    if (module.default && typeof module.default === 'function') {
      return module.default;
    } else if (module[actionName] && typeof module[actionName] === 'function') {
      return module[actionName];
    } else {
      throw new Error(
        `Module at "${handler}" does not export a function ` +
        `(default export or named export '${actionName}').`
      );
    }
  } catch (error: any) {
    throw new Error(
      `Failed to load string handler "${handler}" for action ${capsuleName}.${actionName}: ${error.message}`
    );
  }
}
