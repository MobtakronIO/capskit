import { CapsuleDefinition } from './types/capsule-definition.type';
import { BootOptions } from './types/platform.types';
import { CapsKitPlatform, createCapsKitPlatform } from './caps/platform.cap';
import { convertRegistryToManifest } from './helpers/legacy-bridge.helper';
import { ValidationError, AuthorizationError } from './errors';
import { buildContext } from './helpers/build-context.helper';
import { executeCap } from './helpers/execute-cap.helper';
import { CapInput } from './types/cap-input.type';
import { toCapsuleDefinition } from './helpers/boot-helpers.helper';

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

function createRouter(platform: CapsKitPlatform): { handle: (request: Request) => Promise<Response> } {
  return {
    handle: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      let matchedCapPath: string | null = null;

      for (const [capPath, capFile] of platform.state.caps) {
        const routes = capFile.meta.routes;
        if (routes) {
          for (const route of routes) {
            const pathMatch = route.path === url.pathname;
            const methodMatch = route.method === request.method;
            if (pathMatch && methodMatch) {
              matchedCapPath = capPath;
              break;
            }
          }
        }
        if (matchedCapPath) break;
      }

      if (!matchedCapPath) {
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length === 2) {
          const capPath = `${pathParts[0]}.${pathParts[1]}`;
          if (platform.state.caps.has(capPath)) {
            matchedCapPath = capPath;
          }
        }
      }

      if (!matchedCapPath) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }

      try {
        let body: Record<string, unknown> = {};
        if (request.body) {
          const contentType = request.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            body = await request.json();
          }
        }

        const input: CapInput = {
          body,
          params: {},
          query: Object.fromEntries(url.searchParams),
        };

        const ctx = buildContext(platform.state);
        const result = await executeCap(matchedCapPath, input, ctx);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error: unknown) {
        if (error instanceof ValidationError) {
          return new Response(JSON.stringify({ error: error.message }), { status: 400 });
        }
        if (error instanceof AuthorizationError) {
          return new Response(JSON.stringify({ error: error.message }), { status: 403 });
        }
        if (error instanceof Error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
      }
    },
  };
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
          } else if (source.type === 'registry' && source.registry) {
            name = source.registry.name;
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
        } else if (source.type === 'registry' && source.registry) {
          const manifest = convertRegistryToManifest(source.registry);
          platform.registerCapsule(toCapsuleDefinition(manifest));
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
