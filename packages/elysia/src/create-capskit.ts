import { Elysia } from 'elysia';
import type { CapsuleDefinition, ICapsKit } from '@mobtakronio/capskit';
import { createCapsKit as createCapsKitCore } from '@mobtakronio/capskit';
import { createRouter } from './http';
import { createSocket } from './websocket';
import type { HttpOptions, WebSocketOptions } from './shared';

/** The CapsKit instance type returned by the core createCapsKit factory. */
type CoreCapsKit = Awaited<ReturnType<typeof createCapsKitCore>>['capskit'];

export interface CreateCapsKitAppOptions {
  /** Directories to scan for capsule.ts files */
  capsuleDirs?: string[];
  /** Pre-built capsule definitions (e.g., from createCapsule() factory functions) */
  capsules?: CapsuleDefinition[];
  /** External dependencies injected into ctx.deps.dependencies */
  dependencies?: Record<string, unknown>;
  /** Disable built-in capsules. true/'*' = all, string[] = specific names */
  disableBuiltins?: string[] | boolean | '*';
  /** HTTP port to listen on. If not set, no HTTP server is started. */
  port?: number;
  /** Enable CORS. true = defaults, or pass Elysia cors options */
  cors?: boolean | Record<string, unknown>;
  /** WebSocket path (e.g., '/ws/capskit'). If not set, WebSocket is disabled. */
  wsPath?: string;
  /** HTTP adapter options */
  http?: HttpOptions;
  /** WebSocket adapter options */
  websocket?: WebSocketOptions;
  /** Called after the app is listening */
  onReady?: () => void | Promise<void>;
  /** Called during graceful shutdown */
  onClose?: () => void | Promise<void>;
}

export interface CreateCapsKitAppResult {
  /** The CapsKit instance — use(), call(), getManifests(), shutdown(), etc. */
  capskit: CoreCapsKit;
  /** Real Elysia instance — fully extensible with Elysia features */
  app: Elysia;
  /** Graceful shutdown function */
  shutdown: () => Promise<void>;
}

/**
 * High-level CapsKit factory with Elysia HTTP/WebSocket support.
 * Creates, registers, boots, mounts routes, and starts listening in one call.
 *
 * @example
 * ```ts
 * const { capskit, app, shutdown } = await createCapsKit({
 *   capsuleDirs: ['./capsules'],
 *   port: 3000,
 *   cors: true,
 *   wsPath: '/ws/capskit',
 * });
 *
 * // Extend with Elysia features
 * app.get('/health', () => 'OK');
 *
 * // Use CapsKit
 * const orders = capskit.use('orders');
 * await orders['list-orders']({});
 * ```
 */
export async function createCapsKit(options?: CreateCapsKitAppOptions): Promise<CreateCapsKitAppResult> {
  // 1. Create and boot core CapsKit
  const { capskit } = await createCapsKitCore({
    capsuleDirs: options?.capsuleDirs,
    dependencies: options?.dependencies,
  });

  // 2. Create Elysia app
  const app = new Elysia();

  // 3. Mount capsule routes from meta.routes (CORS applied inside createRouter before routes)
  const httpOptions: HttpOptions = {
    cors: options?.cors,
    ...options?.http,
  };
  app.use(await createRouter(capskit as unknown as ICapsKit, httpOptions));


  // 4. WebSocket
  if (options?.wsPath) {
    const wsOptions: WebSocketOptions = options?.websocket || {};
    const sockets = createSocket(capskit as unknown as ICapsKit, wsOptions);
    app.ws(options.wsPath, sockets[options.wsPath] as any);
  }

  // 5. Listen
  if (options?.port) {
    app.listen(options.port, () => {
      options?.onReady?.();
    });
  }

  // 6. Combined shutdown
  async function shutdown() {
    options?.onClose?.();
    await capskit.shutdown();
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { capskit, app, shutdown };
}
