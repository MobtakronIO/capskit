import type { ICapsKit, CapsuleManifest } from '@mobtakronio/capskit';

/**
 * Adapter options for creating a unified Elysia adapter.
 * 
 * @example
 * ```ts
 * // HTTP-only
 * const { app } = await createElysiaAdapter(capskit, { http: true });
 * 
 * // WebSocket-only
 * const { sockets } = await createElysiaAdapter(capskit, { websocket: true });
 * 
 * // Combined
 * const { app, sockets } = await createElysiaAdapter(capskit, {
 *   http: true,
 *   websocket: true,
 *   onReady: () => console.log('Ready'),
 *   onClose: () => cleanup()
 * });
 * ```
 */
export interface ElysiaAdapterOptions {
  /** Enable HTTP transport. Pass `true` for defaults or an `HttpOptions` object for customization. */
  http?: boolean | HttpOptions;
  
  /** Enable WebSocket transport. Pass `true` for defaults or a `WebSocketOptions` object for customization. */
  websocket?: boolean | WebSocketOptions;
  
  /** Called when the adapter is fully initialized and ready to accept connections. */
  onReady?: () => void | Promise<void>;
  
  /** Called during graceful shutdown to perform cleanup. */
  onClose?: () => void | Promise<void>;
  
  /** Called for any unhandled errors in the adapter lifecycle. */
  onError?: (error: unknown) => void | Promise<void>;
}

/**
 * CORS configuration options compatible with @elysia/cors.
 */
export interface CorsOptions {
  origin?: boolean | string | RegExp | Array<string | RegExp> | ((origin: string, callback: (err: Error | null, allow?: boolean) => void) => void);
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
  credentials?: boolean;
  maxAge?: number;
  preflight?: boolean;
}

/**
 * Options for the HTTP transport.
 */
export interface HttpOptions {
  /**
   * CORS configuration. Pass `true` for defaults or a `CorsOptions` object for customization.
   * When set, CORS middleware is applied before route handlers.
   */
  cors?: boolean | CorsOptions;
}

/**
 * Options for the WebSocket transport.
 * Reserved for future WebSocket-specific configuration.
 */
export interface WebSocketOptions {
  // Reserved for future WS-specific options (e.g., heartbeat interval, max message size)
}

/**
 * Lifecycle hooks available on the unified adapter.
 */
export interface LifecycleHooks {
  /** Called after the adapter finishes initialization. */
  onReady?: () => void | Promise<void>;
  
  /** Called during graceful shutdown. */
  onClose?: () => void | Promise<void>;
  
  /** Called for unhandled errors (both HTTP and WebSocket). */
  onError?: (error: unknown) => void | Promise<void>;
}


export type CreateRouterFn = (capskit: ICapsKit, options?: HttpOptions) => Promise<any> | any;
export type CreateSocketFn = (capskit: ICapsKit, options?: WebSocketOptions) => Promise<any> | any;

export { ICapsKit };
