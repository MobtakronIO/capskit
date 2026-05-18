export { createCapsKitClient } from './client';
export { EventBus, matchEventPattern } from './event-bus';
export { HttpTransport } from './transport/http.transport';
export { WebSocketTransport } from './transport/websocket.transport';
export { AutoTransport } from './transport/auto.transport';
export { OfflineQueue } from './offline-queue';
export { buildInterceptorPipeline } from './interceptors/pipeline';
export {
  loggingInterceptor,
  authInterceptor,
  errorNormalizationInterceptor,
  retryInterceptor,
} from './interceptors/builtins';
export { generateTypes } from './generators/types-generator';

export type {
  CapsKitClient,
  CapsKitClientOptions,
  CapsuleProxy,
  CallOptions,
  DescribeResult,
  EmitResult,
  EventHandler,
  TellResult,
  TransportType,
  UnsubscribeFn,
  AuthConfig,
  RetryConfig,
  WebSocketConfig,
  OfflineConfig,
  InterceptorConfig,
  ClientInterceptor,
  InterceptorContext,
  QueueEntry,
  QueueStatus,
} from './types/client.type';

export type {
  LoggingInterceptorOptions,
  AuthInterceptorOptions,
  RetryInterceptorOptions,
} from './interceptors/builtins';

export {
  CapsKitClientError,
  ActionNotFoundError,
  ActionExecutionError,
  ValidationError,
  NetworkError,
  AuthError,
  OfflineError,
  SubscriptionError,
} from './errors/client-errors.error';
