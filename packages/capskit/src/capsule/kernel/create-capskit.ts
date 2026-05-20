import { CapsuleDefinition } from './types/capsule-definition.type';
import { BootOptions } from './types/platform.types';
import { CapsKitPlatform, createCapsKitPlatform } from './caps/platform.cap';

export interface CreateCapsKitOptions {
  /** Directories to scan for capsule.ts files */
  capsuleDirs?: string[];
  /** Pre-built capsule definitions (e.g., from createCapsule() factory functions) */
  capsules?: CapsuleDefinition[];
  /** External dependencies injected into ctx.deps.dependencies */
  dependencies?: Record<string, unknown>;
  /** Disable built-in capsules. true/'*' = all, string[] = specific names */
  disableBuiltins?: string[] | boolean | '*';
}

export interface CreateCapsKitResult {
  /** The CapsKit platform instance — use(), call(), getManifests(), etc. */
  capskit: CapsKitPlatform;
  /** Graceful shutdown function */
  shutdown: () => Promise<void>;
}

/**
 * High-level CapsKit factory. Creates, registers, and boots the platform in one call.
 *
 * @example
 * ```ts
 * const { capskit, shutdown } = await createCapsKit({
 *   capsuleDirs: ['./capsules'],
 *   capsules: [createDrizzleCapsule({ dialect: 'sqlite', connection: './db.sqlite' })],
 * });
 *
 * const orders = capskit.use('orders');
 * await orders['list-orders']({});
 * ```
 */
export async function createCapsKit(options?: CreateCapsKitOptions): Promise<CreateCapsKitResult> {
  const platform = await createCapsKitPlatform();

  // Register pre-built capsules
  if (options?.capsules) {
    for (const capsule of options.capsules) {
      platform.registerCapsule(capsule);
    }
  }

  // Boot
  const bootOptions: BootOptions = {
    capsuleDirs: options?.capsuleDirs,
    dependencies: options?.dependencies,
    disableBuiltins: options?.disableBuiltins,
  };
  await platform.boot(bootOptions);

  // Graceful shutdown
  async function shutdown() {
    await platform.shutdown();
    process.off('SIGTERM', onSignal);
    process.off('SIGINT', onSignal);
  }

  function onSignal() {
    void shutdown();
  }

  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  return { capskit: platform, shutdown };
}
