import { Elysia } from 'elysia';
import type { ICapsKit } from '@mobtakronio/capskit';
import { createRouter } from './http';
import { createSocket } from './websocket';
import type { ElysiaAdapterOptions, HttpOptions, WebSocketOptions, LifecycleHooks, TraitHandler } from './shared';

export { createRouter } from './http';
export { createSocket } from './websocket';
export * from './shared';

export interface UnifiedElysiaAdapter {
  app?: Elysia;
  sockets: Record<string, any>;
  shutdown: () => Promise<void>;
}

export interface CreateElysiaAdapterOptions extends LifecycleHooks {
  http?: boolean | HttpOptions;
  websocket?: boolean | WebSocketOptions;
  /**
   * @deprecated Use hook caps instead. Trait handlers are legacy adapter-level middleware.
   * Hooks are now handled by the kernel via meta.hooks and capsuleDef.hooks.
   * This field will be removed in a future version.
   */
  traitHandlers?: Record<string, TraitHandler>;
}

function isHttpEnabled(options: CreateElysiaAdapterOptions): options is CreateElysiaAdapterOptions & { http: HttpOptions } {
  return options.http === true || (typeof options.http === 'object' && options.http !== undefined);
}

function isWebSocketEnabled(options: CreateElysiaAdapterOptions): options is CreateElysiaAdapterOptions & { websocket: WebSocketOptions } {
  return options.websocket === true || (typeof options.websocket === 'object' && options.websocket !== undefined);
}

function getHttpOptions(options: CreateElysiaAdapterOptions): HttpOptions | undefined {
  if (options.http === true) return { traitHandlers: options.traitHandlers };
  if (typeof options.http === 'object') {
    return {
      ...(options.traitHandlers && { traitHandlers: options.traitHandlers }),
      ...options.http
    };
  }
  return undefined;
}

function getWebSocketOptions(options: CreateElysiaAdapterOptions): WebSocketOptions | undefined {
  if (options.websocket === true) return {};
  if (typeof options.websocket === 'object') return options.websocket;
  return undefined;
}

/**
 * Create a unified Elysia adapter combining HTTP and/or WebSocket transports.
 *
 * @param capskit - The CapsKit kernel instance
 * @param options - Adapter options controlling which transports to enable
 * @returns Object with `app` (Elysia instance), `sockets`, and `shutdown` function
 *
 * @example
 * ```ts
 * // Combined HTTP + WebSocket
 * const { app, sockets, shutdown } = await createElysiaAdapter(capskit, {
 *   http: true,
 *   websocket: true,
 * });
 *
 * // HTTP only
 * const { app } = await createElysiaAdapter(capskit, { http: true });
 *
 * // WebSocket only
 * const { sockets } = await createElysiaAdapter(capskit, { websocket: true });
 * ```
 */
export async function createElysiaAdapter(capskit: ICapsKit, options: CreateElysiaAdapterOptions = {}): Promise<UnifiedElysiaAdapter> {
  const httpOptions = getHttpOptions(options);
  const wsOptions = getWebSocketOptions(options);
  
  const enableHttp = httpOptions !== undefined;
  const enableWs = wsOptions !== undefined;

  if (!enableHttp && !enableWs) {
    throw new Error('[Elysia Adapter] At least one of http or websocket must be enabled');
  }

  const lifecycle: LifecycleHooks = {
    onReady: options.onReady,
    onClose: options.onClose,
    onError: options.onError
  };

  let app: Elysia | undefined;
  let sockets: Record<string, any> = {};

  if (enableHttp && httpOptions) {
    app = await createRouter(capskit, httpOptions);
  }

  if (enableWs && wsOptions) {
    sockets = createSocket(capskit, wsOptions);

    if (app) {
      for (const [path, handler] of Object.entries(sockets)) {
        app.ws(path, handler);
      }
    }
  }

  const handleError = async (error: unknown) => {
    if (lifecycle.onError) {
      await lifecycle.onError(error);
    } else {
      console.error('[Elysia Adapter] Unhandled error:', error);
    }
  };

  process.on('uncaughtException', handleError);
  process.on('unhandledRejection', handleError);

  if (lifecycle.onReady) {
    await lifecycle.onReady();
  }

  const shutdown = async () => {
    process.off('uncaughtException', handleError);
    process.off('unhandledRejection', handleError);
    
    if (lifecycle.onClose) {
      await lifecycle.onClose();
    }
  };

  return {
    app,
    sockets,
    shutdown
  };
}

export default createElysiaAdapter;

export { createCapsKit } from './create-capskit';
export type { CreateCapsKitAppOptions, CreateCapsKitAppResult } from './create-capskit';