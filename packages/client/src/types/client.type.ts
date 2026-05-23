import type { CapsuleManifest } from '@mobtakronio/capskit';

export interface CallOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

export interface AuthConfig {
  token: () => string | Promise<string>;
  refresh?: () => Promise<string>;
}

export interface RetryConfig {
  maxRetries?: number;
  backoff?: 'linear' | 'exponential' | 'none';
  retryOn?: number[];
}

export type TransportType = 'http' | 'websocket' | 'auto';

export interface WebSocketConfig {
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  reconnectIntervalMax?: number;
}

export interface OfflineConfig {
  enabled?: boolean;
  maxQueueSize?: number;
  storage?: 'indexeddb' | 'memory';
}

export interface ClientInterceptor {
  name: string;
  before?: (ctx: InterceptorContext) => Promise<InterceptorContext> | InterceptorContext;
  after?: (ctx: InterceptorContext) => Promise<InterceptorContext> | InterceptorContext;
}

export interface InterceptorContext {
  actionPath: string;
  payload: unknown;
  result?: unknown;
  error?: unknown;
  durationMs?: number;
  metadata: Record<string, unknown>;
}

export interface InterceptorConfig {
  before?: ClientInterceptor[];
  after?: ClientInterceptor[];
}

export interface QueueEntry {
  id: string;
  actionPath: string;
  payload: unknown;
  timestamp: number;
  type: 'call' | 'emit';
}

export interface QueueStatus {
  pending: number;
  maxSize: number;
  oldestEntry: Date | null;
}

export interface CapsKitClientOptions {
  transport?: TransportType;
  baseUrl: string;
  auth?: AuthConfig;
  retry?: RetryConfig;
  websocket?: WebSocketConfig;
  offline?: OfflineConfig;
  interceptors?: InterceptorConfig;
}

export interface DescribeResult {
  capsules: CapsuleManifest[];
  capsuleCount: number;
  capCount: number;
}

export interface EmitResult {
  emitted: boolean;
  event: string;
}

export type UnsubscribeFn = () => void;

export type EventHandler = (data: unknown, event: string) => void;

export interface CapsKitClient {
  call<T = unknown>(actionPath: string, payload?: unknown, options?: CallOptions): Promise<T>;
  use<TCapsule = CapsuleProxy>(capsuleName: string): TCapsule;
  emit(event: string, data: unknown): Promise<EmitResult>;
  describe(): Promise<DescribeResult>;
  subscribe(pattern: string, handler: EventHandler): UnsubscribeFn;
  disconnect(): Promise<void>;
  loadManifest(): Promise<void>;
  getQueueStatus(): Promise<QueueStatus>;
  flushQueue(): Promise<void>;
  clearQueue(): Promise<void>;
}

export interface CapsuleProxy {
  [key: string]: (payload?: unknown) => Promise<unknown>;
}
