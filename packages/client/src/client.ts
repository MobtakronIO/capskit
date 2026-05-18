import { HttpTransport } from './transport/http.transport';
import { WebSocketTransport } from './transport/websocket.transport';
import { AutoTransport } from './transport/auto.transport';
import { EventBus } from './event-bus';
import { OfflineQueue } from './offline-queue';
import { buildInterceptorPipeline } from './interceptors/pipeline';
import { CapsKitClientError, ActionNotFoundError, SubscriptionError, NetworkError, OfflineError } from './errors/client-errors.error';
import type {
  CapsKitClient,
  CapsKitClientOptions,
  CapsuleProxy,
  CallOptions,
  DescribeResult,
  EmitResult,
  EventHandler,
  TellResult,
  UnsubscribeFn,
  ClientInterceptor,
  QueueStatus,
  QueueEntry,
} from './types/client.type';
import type { CapsuleManifest, CapsuleCapManifest } from '@mobtakronio/capskit';

export function createCapsKitClient(options: CapsKitClientOptions): CapsKitClient {
  const { baseUrl, auth, retry, websocket, offline, interceptors } = options;
  const transportType = options.transport ?? 'http';

  const eventBus = new EventBus();
  const subscriptions = new Map<string, { pattern: string; handler: EventHandler }>();
  let subCounter = 0;

  // ── Offline queue ───────────────────────────────────────────────
  const offlineEnabled = offline?.enabled ?? false;
  const offlineMaxSize = offline?.maxQueueSize ?? 100;
  const offlineQueue = offlineEnabled
    ? new OfflineQueue({
        maxQueueSize: offlineMaxSize,
        storage: offline?.storage,
      })
    : null;

  // Track if we are currently offline
  let isOffline = false;
  // Resolvers for queued operations waiting to be replayed
  const pendingOfflineOps = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  // ── Manifest cache ──────────────────────────────────────────────
  let cachedManifest: DescribeResult | null = null;
  let knownCaps = new Map<string, CapsuleCapManifest[]>(); // capsuleName -> caps[]

  // ── Interceptors ────────────────────────────────────────────────
  const allInterceptors: ClientInterceptor[] = [
    ...(interceptors?.before ?? []),
    ...(interceptors?.after ?? []),
  ];

  // ── Transport setup ─────────────────────────────────────────────

  if (transportType === 'websocket') {
    return createWebSocketClient();
  }

  if (transportType === 'auto') {
    return createAutoClient();
  }

  // Default: HTTP only
  return createHttpClient();

  // ── Shared helpers ──────────────────────────────────────────────

  function wrapWithInterceptors(
    executor: (actionPath: string, payload: unknown) => Promise<unknown>,
  ) {
    if (allInterceptors.length === 0) return executor;

    return async (actionPath: string, payload: unknown) => {
      return buildInterceptorPipeline(allInterceptors, executor, actionPath, payload);
    };
  }

  function maybeQueue(actionPath: string, payload: unknown, type: 'call' | 'emit'): Promise<unknown> | null {
    if (!offlineQueue || !offlineEnabled) return null;

    // Check browser online status (only in browser)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      isOffline = true;
      return new Promise((resolve, reject) => {
        offlineQueue.enqueue({ actionPath, payload, type }).then((entry) => {
          pendingOfflineOps.set(entry.id, { resolve, reject });
        }).catch(reject);
      });
    }

    return null;
  }

  async function flushOfflineQueue(callFn: (actionPath: string, payload: unknown) => Promise<unknown>): Promise<void> {
    if (!offlineQueue) return;

    isOffline = false;
    const entries = await offlineQueue.getAll();

    for (const entry of entries) {
      try {
        const result = await callFn(entry.actionPath, entry.payload);
        const pending = pendingOfflineOps.get(entry.id);
        if (pending) {
          pending.resolve(result);
          pendingOfflineOps.delete(entry.id);
        }
      } catch (err) {
        const pending = pendingOfflineOps.get(entry.id);
        if (pending) {
          pending.reject(err instanceof Error ? err : new Error(String(err)));
          pendingOfflineOps.delete(entry.id);
        }
      }
    }

    await offlineQueue.clear();
  }

  function setupOnlineListener(callFn: (actionPath: string, payload: unknown) => Promise<unknown>): void {
    if (typeof window !== 'undefined' && offlineEnabled) {
      window.addEventListener('online', () => {
        flushOfflineQueue(callFn).catch(() => {});
      });
    }
  }

  function buildProxy(
    capsuleName: string,
    callFn: (actionPath: string, payload?: unknown) => Promise<unknown>,
  ): CapsuleProxy {
    const caps = knownCaps.get(capsuleName) ?? [];
    const knownCapNames = new Set(caps.map((c) => c.name));

    return new Proxy({}, {
      get(_target, prop: string) {
        return async (payload?: unknown) => callFn(`${capsuleName}.${prop}`, payload);
      },
      ownKeys() {
        return caps.length > 0 ? [...knownCapNames] : [];
      },
      getOwnPropertyDescriptor(_target, prop: string) {
        return {
          enumerable: true,
          configurable: true,
          value: async (payload?: unknown) => callFn(`${capsuleName}.${String(prop)}`, payload),
        };
      },
    }) as CapsuleProxy;
  }

  // ── HTTP-only client ────────────────────────────────────────────

  function createHttpClient(): CapsKitClient {
    const http = new HttpTransport({ baseUrl, auth, retry });
    const wrappedCall = wrapWithInterceptors(
      (actionPath, payload) => http.call(actionPath, payload),
    );

    function useProxy<TCapsule = CapsuleProxy>(capsuleName: string): TCapsule {
      return buildProxy(capsuleName, async (actionPath, payload) => {
        const queued = maybeQueue(actionPath, payload, 'call');
        if (queued !== null) return queued;
        return wrappedCall(actionPath, payload);
      }) as TCapsule;
    }

    function subscribe(pattern: string, handler: EventHandler): UnsubscribeFn {
      throw new SubscriptionError(
        'Subscriptions require WebSocket transport. Set transport to "websocket" or "auto".',
      );
    }

    async function disconnect(): Promise<void> {
      eventBus.clear();
      subscriptions.clear();
    }

    async function loadManifest(): Promise<void> {
      const result = await http.describe();
      cachedManifest = result;
      knownCaps.clear();
      for (const capsule of result.capsules) {
        knownCaps.set(capsule.name, capsule.caps);
      }
    }

    async function getQueueStatus(): Promise<QueueStatus> {
      if (!offlineQueue) return { pending: 0, maxSize: 0, oldestEntry: null };
      const size = await offlineQueue.size();
      const oldest = await offlineQueue.peek();
      return {
        pending: size,
        maxSize: offlineMaxSize,
        oldestEntry: oldest ? new Date(oldest.timestamp) : null,
      };
    }

    async function flushQueue(): Promise<void> {
      await flushOfflineQueue(wrappedCall);
    }

    async function clearQueue(): Promise<void> {
      if (offlineQueue) {
        await offlineQueue.clear();
        for (const [id, pending] of pendingOfflineOps) {
          pending.reject(new OfflineError('Queue cleared'));
          pendingOfflineOps.delete(id);
        }
      }
    }

    const client: CapsKitClient = {
      call: async <T = unknown>(actionPath: string, payload?: unknown, opts?: CallOptions): Promise<T> => {
        const queued = maybeQueue(actionPath, payload ?? {}, 'call');
        if (queued !== null) return queued as Promise<T>;
        return wrappedCall(actionPath, payload) as Promise<T>;
      },
      use: useProxy,
      emit: async (event, data) => {
        const queued = maybeQueue(event, data, 'emit');
        if (queued !== null) return queued as Promise<EmitResult>;
        return http.emit(event, data);
      },
      tell: (actionPath, payload) => http.tell(actionPath, payload),
      describe: async () => {
        const result = await http.describe();
        cachedManifest = result;
        knownCaps.clear();
        for (const capsule of result.capsules) {
          knownCaps.set(capsule.name, capsule.caps);
        }
        return result;
      },
      subscribe,
      disconnect,
      loadManifest,
      getQueueStatus,
      flushQueue,
      clearQueue,
    };

    setupOnlineListener((actionPath, payload) => wrappedCall(actionPath, payload));

    return client;
  }

  // ── WebSocket-only client ───────────────────────────────────────

  function createWebSocketClient(): CapsKitClient {
    const ws = new WebSocketTransport({
      baseUrl,
      auth,
      websocket: {
        reconnect: websocket?.reconnect ?? true,
        maxReconnectAttempts: websocket?.maxReconnectAttempts,
        reconnectInterval: websocket?.reconnectInterval,
        reconnectIntervalMax: websocket?.reconnectIntervalMax,
      },
    });

    // Wire event bus to WS event handler
    ws.setEventHandler((event, data) => {
      eventBus.dispatch(event, data);
    });

    // Auto-connect for websocket-only mode
    ws.connect().catch(() => {
      // Connection failure will be surfaced on first call
    });

    async function ensureConnected(): Promise<void> {
      const state = ws.connectionState;
      if (state === 'connected') return;
      if (state === 'connecting') {
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      }
      if (ws.connectionState !== 'connected') {
        await ws.connect();
      }
    }

    const wrappedCall = wrapWithInterceptors(
      async (actionPath, payload) => {
        await ensureConnected();
        return ws.call(actionPath, payload);
      },
    );

    function useProxy<TCapsule = CapsuleProxy>(capsuleName: string): TCapsule {
      return buildProxy(capsuleName, async (actionPath, payload) => {
        const queued = maybeQueue(actionPath, payload, 'call');
        if (queued !== null) return queued;
        return wrappedCall(actionPath, payload);
      }) as TCapsule;
    }

    function subscribe(pattern: string, handler: EventHandler): UnsubscribeFn {
      const id = `sub-${++subCounter}`;
      subscriptions.set(id, { pattern, handler });
      eventBus.subscribe(id, [pattern], handler);

      ws.subscribe(id, [pattern]).catch(() => {
        // Subscription failed on server side
      });

      return () => {
        subscriptions.delete(id);
        eventBus.unsubscribe(id);
        ws.unsubscribe(id).catch(() => {});
      };
    }

    async function disconnect(): Promise<void> {
      eventBus.clear();
      subscriptions.clear();
      await ws.disconnect();
    }

    async function loadManifest(): Promise<void> {
      await ensureConnected();
      const result = await ws.describe();
      cachedManifest = result;
      knownCaps.clear();
      for (const capsule of result.capsules) {
        knownCaps.set(capsule.name, capsule.caps);
      }
    }

    async function getQueueStatus(): Promise<QueueStatus> {
      if (!offlineQueue) return { pending: 0, maxSize: 0, oldestEntry: null };
      const size = await offlineQueue.size();
      const oldest = await offlineQueue.peek();
      return {
        pending: size,
        maxSize: offlineMaxSize,
        oldestEntry: oldest ? new Date(oldest.timestamp) : null,
      };
    }

    async function flushQueue(): Promise<void> {
      await flushOfflineQueue(wrappedCall);
    }

    async function clearQueue(): Promise<void> {
      if (offlineQueue) {
        await offlineQueue.clear();
        for (const [id, pending] of pendingOfflineOps) {
          pending.reject(new OfflineError('Queue cleared'));
          pendingOfflineOps.delete(id);
        }
      }
    }

    const client: CapsKitClient = {
      call: async <T = unknown>(actionPath: string, payload?: unknown, opts?: CallOptions): Promise<T> => {
        const queued = maybeQueue(actionPath, payload ?? {}, 'call');
        if (queued !== null) return queued as Promise<T>;
        return wrappedCall(actionPath, payload) as Promise<T>;
      },
      use: useProxy,
      emit: async (event, data) => {
        const queued = maybeQueue(event, data, 'emit');
        if (queued !== null) return queued as Promise<EmitResult>;
        await ensureConnected();
        return ws.emit(event, data);
      },
      tell: async (actionPath, payload) => {
        await ensureConnected();
        return ws.tell(actionPath, payload);
      },
      describe: async () => {
        await ensureConnected();
        const result = await ws.describe();
        cachedManifest = result;
        knownCaps.clear();
        for (const capsule of result.capsules) {
          knownCaps.set(capsule.name, capsule.caps);
        }
        return result;
      },
      subscribe,
      disconnect,
      loadManifest,
      getQueueStatus,
      flushQueue,
      clearQueue,
    };

    setupOnlineListener((actionPath, payload) => wrappedCall(actionPath, payload));

    return client;
  }

  // ── Auto client (HTTP + WebSocket on demand) ────────────────────

  function createAutoClient(): CapsKitClient {
    const auto = new AutoTransport({
      baseUrl,
      auth,
      retry,
      websocket: {
        reconnect: websocket?.reconnect ?? true,
        maxReconnectAttempts: websocket?.maxReconnectAttempts,
        reconnectInterval: websocket?.reconnectInterval,
        reconnectIntervalMax: websocket?.reconnectIntervalMax,
      },
    });

    // Wire event bus to WS event handler
    auto.setWsEventHandler((event, data) => {
      eventBus.dispatch(event, data);
    });

    // Track active subscription patterns for re-subscribe after reconnect
    const activePatterns = new Map<string, string[]>();

    const wrappedCall = wrapWithInterceptors(
      (actionPath, payload) => auto.call(actionPath, payload),
    );

    function useProxy<TCapsule = CapsuleProxy>(capsuleName: string): TCapsule {
      return buildProxy(capsuleName, async (actionPath, payload) => {
        const queued = maybeQueue(actionPath, payload, 'call');
        if (queued !== null) return queued;
        return wrappedCall(actionPath, payload);
      }) as TCapsule;
    }

    function subscribe(pattern: string, handler: EventHandler): UnsubscribeFn {
      const id = `sub-${++subCounter}`;
      subscriptions.set(id, { pattern, handler });
      eventBus.subscribe(id, [pattern], handler);
      activePatterns.set(id, [pattern]);

      auto.subscribe(id, [pattern]).catch(() => {
        // Subscription failed
      });

      return () => {
        subscriptions.delete(id);
        eventBus.unsubscribe(id);
        activePatterns.delete(id);
        auto.unsubscribe(id).catch(() => {});
      };
    }

    async function disconnect(): Promise<void> {
      eventBus.clear();
      subscriptions.clear();
      activePatterns.clear();
      await auto.disconnect();
    }

    async function loadManifest(): Promise<void> {
      const result = await auto.describe();
      cachedManifest = result;
      knownCaps.clear();
      for (const capsule of result.capsules) {
        knownCaps.set(capsule.name, capsule.caps);
      }
    }

    async function getQueueStatus(): Promise<QueueStatus> {
      if (!offlineQueue) return { pending: 0, maxSize: 0, oldestEntry: null };
      const size = await offlineQueue.size();
      const oldest = await offlineQueue.peek();
      return {
        pending: size,
        maxSize: offlineMaxSize,
        oldestEntry: oldest ? new Date(oldest.timestamp) : null,
      };
    }

    async function flushQueue(): Promise<void> {
      await flushOfflineQueue(wrappedCall);
    }

    async function clearQueue(): Promise<void> {
      if (offlineQueue) {
        await offlineQueue.clear();
        for (const [id, pending] of pendingOfflineOps) {
          pending.reject(new OfflineError('Queue cleared'));
          pendingOfflineOps.delete(id);
        }
      }
    }

    const client: CapsKitClient = {
      call: async <T = unknown>(actionPath: string, payload?: unknown, opts?: CallOptions): Promise<T> => {
        const queued = maybeQueue(actionPath, payload ?? {}, 'call');
        if (queued !== null) return queued as Promise<T>;
        return wrappedCall(actionPath, payload) as Promise<T>;
      },
      use: useProxy,
      emit: async (event, data) => {
        const queued = maybeQueue(event, data, 'emit');
        if (queued !== null) return queued as Promise<EmitResult>;
        return auto.emit(event, data);
      },
      tell: (actionPath, payload) => auto.tell(actionPath, payload),
      describe: async () => {
        const result = await auto.describe();
        cachedManifest = result;
        knownCaps.clear();
        for (const capsule of result.capsules) {
          knownCaps.set(capsule.name, capsule.caps);
        }
        return result;
      },
      subscribe,
      disconnect,
      loadManifest,
      getQueueStatus,
      flushQueue,
      clearQueue,
    };

    setupOnlineListener((actionPath, payload) => wrappedCall(actionPath, payload));

    return client;
  }
}
