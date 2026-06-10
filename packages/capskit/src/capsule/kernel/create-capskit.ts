import { CapsuleDefinition } from './types/capsule-definition.type';
import { BootOptions } from './types/platform.types';
import { CapsKitPlatform, createCapsKitPlatform } from './caps/platform.cap';
import { buildContext } from './helpers/build-context.helper';
import { CapInput } from './types/cap-input.type';
import { toCapsuleDefinition } from './helpers/boot-helpers.helper';
import { createRouter } from './helpers/platform/create-router.helper';


export interface CreateCapsKitOptions {
  /** Directories to scan for capsule.ts files */
  capsuleDirs?: string[];
  /** Pre-built capsule definitions (e.g., from createCapsule() factory functions) or legacy CapsuleSource array */
  capsules?: any[];
  /** External dependencies injected into ctx.deps.dependencies */
  dependencies?: Record<string, unknown>;
  /** Disable built-in capsules. true/'*' = all, string[] = specific names */
  disableBuiltins?: string[] | boolean | '*';
  /** Discourage direct calls using platform.call() */
  warnOnDirectCall?: boolean;
  /** Boot action and payload */
  boot?: { action: string; payload?: Record<string, unknown> };
}

export interface CreateCapsKitResult {
  /** The CapsKit platform instance — use(), call(), getManifests(), etc. */
  capskit: CapsKitPlatform;
  /** Graceful shutdown function */
  shutdown: () => Promise<void>;
  /** Compatibility HTTP router */
  router: { handle: (request: Request) => Promise<Response> };
}

/**
 * High-level CapsKit factory. Creates, registers, and boots the platform in one call.
 */
export async function createCapsKit(options?: CreateCapsKitOptions): Promise<CreateCapsKitResult> {
  const platform = await createCapsKitPlatform();

  const bootOptions: BootOptions = {
    capsuleDirs: options?.capsuleDirs ? [...options.capsuleDirs] : [],
    dependencies: options?.dependencies,
    disableBuiltins: options?.disableBuiltins,
    warnOnDirectCall: options?.warnOnDirectCall,
  };

  // Check for duplicate capsule names first
  if (options?.capsules) {
    const names = new Set<string>();
    const duplicates: string[] = [];
    for (const capsule of options.capsules) {
      let name: string | undefined;
      if (typeof capsule === 'object' && capsule !== null) {
        if ('type' in capsule) {
          const source = capsule as any;
          if (source.type === 'manifest' && source.manifest) {
            name = source.manifest.name;
          }
        } else if ('name' in capsule) {
          name = (capsule as any).name;
        }
      }
      if (name) {
        if (names.has(name)) {
          duplicates.push(name);
        } else {
          names.add(name);
        }
      }
    }
    if (duplicates.length > 0) {
      const err = new Error(`Duplicate capsule name(s): ${duplicates.join(', ')}`);
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  // Register pre-built capsules
  if (options?.capsules) {
    for (const capsule of options.capsules) {
      if (typeof capsule === 'object' && capsule !== null && 'type' in capsule) {
        const source = capsule as any;
        if (source.type === 'manifest' && source.manifest) {
          platform.registerCapsule(toCapsuleDefinition(source.manifest));
        } else if (source.type === 'directory' && source.path) {
          if (!bootOptions.capsuleDirs) {
            bootOptions.capsuleDirs = [];
          }
          bootOptions.capsuleDirs.push(source.path);
        }
      } else {
        platform.registerCapsule(capsule as CapsuleDefinition);
      }
    }
  }


  // Boot
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

  let router: { handle: (request: Request) => Promise<Response> } | undefined;

  if (options?.boot) {
    const bootAction = options.boot.action;
    const capFile = platform.state.caps.get(bootAction);
    if (capFile) {
      const ctx = buildContext(platform.state);
      const result = await capFile.handler({ body: options.boot.payload }, ctx) as any;
      if (result?.router) {
        router = result.router;
        if (router && typeof (router as any).handle !== 'function' && typeof (router as any).app?.handle === 'function') {
          (router as any).handle = (router as any).app.handle.bind((router as any).app);
        }
      }
    }
  }

  if (!router) {
    router = createRouter(platform);
  }

  return { capskit: platform, shutdown, router };
}
