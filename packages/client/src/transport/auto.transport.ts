import { HttpTransport } from './http.transport';
import { WebSocketTransport } from './websocket.transport';
import type { AuthConfig, CallOptions, DescribeResult, EmitResult, RetryConfig, WebSocketConfig } from '../types/client.type';
import { OfflineError, SubscriptionError } from '../errors/client-errors.error';

export interface AutoTransportConfig {
  baseUrl: string;
  wsPath?: string;
  auth?: AuthConfig;
  retry?: RetryConfig;
  websocket?: WebSocketConfig;
}

/**
 * Auto transport wraps HTTP and WebSocket transports.
 * - Starts with HTTP for one-off calls
 * - On first subscribe(), establishes WebSocket connection
 * - Routes call/emit/describe to WS if connected, otherwise HTTP
 * - Routes subscribe/unsubscribe to WS only
 */
export class AutoTransport {
  private http: HttpTransport;
  private ws: WebSocketTransport | null = null;
  private wsConnecting: Promise<void> | null = null;
  private config: AutoTransportConfig;

  constructor(config: AutoTransportConfig) {
    this.config = config;
    this.http = new HttpTransport({
      baseUrl: config.baseUrl,
      auth: config.auth,
      retry: config.retry,
    });
  }

  get wsTransport(): WebSocketTransport | null {
    return this.ws;
  }

  setWsEventHandler(handler: ((event: string, data: unknown) => void) | null): void {
    this.ensureWsTransport();
    this.ws?.setEventHandler(handler);
  }

  async connectWs(): Promise<void> {
    if (this.ws && this.ws.connectionState === 'connected') {
      return;
    }

    if (this.wsConnecting) {
      return this.wsConnecting;
    }

    this.ensureWsTransport();
    this.wsConnecting = this.ws!.connect().finally(() => {
      this.wsConnecting = null;
    });

    return this.wsConnecting;
  }

  async call<T = unknown>(actionPath: string, payload?: unknown, options?: CallOptions): Promise<T> {
    // Prefer WS if connected
    if (this.ws?.connectionState === 'connected') {
      return this.ws.call<T>(actionPath, payload, options);
    }
    return this.http.call<T>(actionPath, payload, options);
  }

  async emit(event: string, data: unknown): Promise<EmitResult> {
    if (this.ws?.connectionState === 'connected') {
      return this.ws.emit(event, data);
    }
    return this.http.emit(event, data);
  }

  async describe(): Promise<DescribeResult> {
    if (this.ws?.connectionState === 'connected') {
      return this.ws.describe();
    }
    return this.http.describe();
  }

  async subscribe(id: string, patterns: string[]): Promise<void> {
    await this.connectWs();
    if (!this.ws) {
      throw new SubscriptionError('Failed to establish WebSocket connection for subscription');
    }
    return this.ws.subscribe(id, patterns);
  }

  async unsubscribe(id: string): Promise<void> {
    if (!this.ws) {
      return;
    }
    return this.ws.unsubscribe(id);
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      await this.ws.disconnect();
      this.ws = null;
    }
  }

  private ensureWsTransport(): void {
    if (!this.ws) {
      this.ws = new WebSocketTransport({
        baseUrl: this.config.baseUrl,
        wsPath: this.config.wsPath,
        auth: this.config.auth,
        websocket: this.config.websocket,
      });
    }
  }
}
