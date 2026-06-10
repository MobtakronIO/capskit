import { CapsuleManifest } from './capsule-manifest.type';
import { CapInput, CapContext, CapHandler, InterceptorFn } from './cap-input.type';

/**
 * Public interface for the CapsKit kernel instance.
 * This is what adapters and consumers interact with.
 */
export interface ICapsKit {
  /** Start the kernel and boot all capsules */
  start(): Promise<{ status: string; capsuleCount: number; capCount: number }>;

  /**
   * Call an action by its full path (e.g., 'invoicing.create').
   * Returns the raw result from the action handler.
   */
  call(capPath: string, payload?: unknown): Promise<unknown>;

  /**
   * Get a proxy for a capsule that allows calling its caps as methods.
   * Example: capskit.use('invoicing').create({ body: {...} })
   */
  use<TCapsule = unknown>(capsuleName: string): TCapsule;

  /**
   * Emit an event to all subscribers.
   */
  emit(event: string, data: unknown): void;

  /**
   * Get the manifest for a specific capsule by name.
   * Returns undefined if the capsule is not registered.
   */
  describe(capsuleName: string): CapsuleManifest | undefined;

  /**
   * Get all registered capsule manifests.
   */
  getManifests(): CapsuleManifest[];

  /**
   * Register a global hook.
   */
  addHook(hook: { name: string; handler: CapHandler }): void;

  /**
   * Add a global interceptor.
   */
  addInterceptor(interceptor: InterceptorFn): void;

  /**
   * Gracefully shutdown the kernel.
   */
  shutdown(): Promise<{ status: string }>;
}
