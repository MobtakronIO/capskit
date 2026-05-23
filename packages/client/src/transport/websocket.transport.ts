import type {
  WSClientFrame,
  WSServerFrame,
  WSResponseFrame,
  WSEventFrame,
  WSManifestFrame,
  WSErrorFrame,
  WSWelcomeFrame,
  WSErrorEnvelope,
} from '@mobtakronio/capskit';
import type { AuthConfig, CallOptions, DescribeResult, EmitResult, WebSocketConfig } from '../types/client.type';
import { NetworkError, ActionExecutionError, SubscriptionError, OfflineError } from '../errors/client-errors.error';

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  actionPath?: string;
};

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type WebSocketEventHandler = (event: string, data: unknown) => void;

export interface WebSocketTransportConfig {
  baseUrl: string;
  wsPath?: string;
  auth?: AuthConfig;
  websocket?: WebSocketConfig;
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveWsUrl(baseUrl: string, wsPath: string): string {
  const sanitized = baseUrl.replace(/\/+$/, '');
  const protocol = sanitized.startsWith('https') ? 'wss' : 'ws';
  const host = sanitized.replace(/^https?:\/\//, '');
  return `${protocol}://${host}${wsPath}`;
}

export class WebSocketTransport {
  private wsUrl: string;
  private auth?: AuthConfig;
  private wsConfig: Required<WebSocketConfig>;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private pending = new Map<string, PendingResolver>();
  private eventHandler: WebSocketEventHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;
  private clientId: string | null = null;
  private handshakeResolve: (() => void) | null = null;

  constructor(config: WebSocketTransportConfig) {
    this.wsUrl = deriveWsUrl(config.baseUrl, config.wsPath ?? '/ws/capskit');
    this.auth = config.auth;
    this.wsConfig = {
      reconnect: config.websocket?.reconnect ?? true,
      maxReconnectAttempts: config.websocket?.maxReconnectAttempts ?? 10,
      reconnectInterval: config.websocket?.reconnectInterval ?? 1000,
      reconnectIntervalMax: config.websocket?.reconnectIntervalMax ?? 30000,
    };
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  setEventHandler(handler: WebSocketEventHandler | null): void {
    this.eventHandler = handler;
  }

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.manualClose = false;
    this.clientId = null;

    return new Promise((resolve, reject) => {
      this.state = 'connecting';

      try {
        this.ws = new WebSocket(this.wsUrl);
      } catch (err) {
        this.state = 'disconnected';
        reject(new NetworkError(`Failed to create WebSocket: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      this.ws.onopen = () => {
        this.handshakeResolve = () => {
          this.state = 'connected';
          this.handshakeResolve = null;
          resolve();
        };
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = () => {
        if (this.state === 'connecting') {
          this.state = 'disconnected';
          this.handshakeResolve = null;
          reject(new NetworkError('WebSocket connection failed'));
        }
      };

      this.ws.onclose = () => {
        this.handshakeResolve = null;
        if (this.manualClose) {
          this.state = 'disconnected';
          this.rejectAllPending(new OfflineError('WebSocket connection closed'));
          return;
        }

        this.state = 'disconnected';
        this.rejectAllPending(new OfflineError('WebSocket connection lost'));

        if (this.wsConfig.reconnect) {
          this.scheduleReconnect();
        }
      };
    });
  }

  async call<T = unknown>(actionPath: string, payload?: unknown, _options?: CallOptions): Promise<T> {
    if (this.state !== 'connected') {
      throw new OfflineError('WebSocket is not connected');
    }

    const id = generateRequestId();
    const frame: WSClientFrame = { type: 'call', clientId: this.clientId!, id, actionPath, payload };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        actionPath,
      });

      this.send(frame);
    });
  }

  async emit(event: string, data: unknown): Promise<EmitResult> {
    if (this.state !== 'connected') {
      throw new OfflineError('WebSocket is not connected');
    }

    const frame: WSClientFrame = { type: 'emit', clientId: this.clientId!, event, data };
    this.send(frame);
    return { emitted: true, event };
  }

  async describe(): Promise<DescribeResult> {
    if (this.state !== 'connected') {
      throw new OfflineError('WebSocket is not connected');
    }

    const id = generateRequestId();
    const frame: WSClientFrame = { type: 'describe', clientId: this.clientId!, id };

    return new Promise<DescribeResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as DescribeResult),
        reject,
      });

      this.send(frame);
    });
  }

  async subscribe(id: string, patterns: string[]): Promise<void> {
    if (this.state !== 'connected') {
      throw new SubscriptionError('WebSocket is not connected');
    }

    const frame: WSClientFrame = { type: 'subscribe', clientId: this.clientId!, id, patterns };
    this.send(frame);
  }

  async unsubscribe(id: string): Promise<void> {
    if (this.state !== 'connected') {
      return;
    }

    const frame: WSClientFrame = { type: 'unsubscribe', clientId: this.clientId!, id };
    this.send(frame);
  }

  async disconnect(): Promise<void> {
    this.manualClose = true;
    this.cancelReconnect();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.state = 'disconnected';
    this.rejectAllPending(new OfflineError('WebSocket disconnected by client'));
  }

  private send(frame: WSClientFrame): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new NetworkError('WebSocket is not open');
    }
    this.ws.send(JSON.stringify(frame));
  }

  private handleMessage(raw: string): void {
    let frame: WSServerFrame;
    try {
      frame = JSON.parse(raw) as WSServerFrame;
    } catch {
      return;
    }

    switch (frame.type) {
      case 'welcome':
        this.handleWelcome(frame);
        break;
      case 'response':
        this.handleResponse(frame);
        break;
      case 'event':
        this.handleEvent(frame);
        break;
      case 'manifest':
        this.handleManifest(frame);
        break;
      case 'error':
        this.handleError(frame);
        break;
    }
  }

  private handleWelcome(frame: WSWelcomeFrame): void {
    this.clientId = frame.clientId;
    if (this.handshakeResolve) {
      this.handshakeResolve();
    }
  }

  private handleResponse(frame: WSResponseFrame): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    this.pending.delete(frame.id);

    if (frame.ok) {
      pending.resolve(frame.result);
    } else {
      const actionPath = pending.actionPath ?? 'unknown';
      const errorMsg = typeof frame.error === 'string'
        ? frame.error
        : (frame.error as WSErrorEnvelope)?.message ?? 'Unknown error';
      pending.reject(new ActionExecutionError(actionPath, errorMsg));
    }
  }

  private handleEvent(frame: WSEventFrame): void {
    if (this.eventHandler) {
      this.eventHandler(frame.event, frame.data);
    }
  }

  private handleManifest(frame: WSManifestFrame): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    this.pending.delete(frame.id);

    const data = frame.data;
    const capsules = Array.isArray(data) ? data : [];
    pending.resolve({
      capsules,
      capsuleCount: capsules.length,
      capCount: capsules.reduce(
        (sum: number, c: { caps?: unknown[] }) => sum + (Array.isArray(c?.caps) ? c.caps.length : 0),
        0,
      ),
    });
  }

  private handleError(frame: WSErrorFrame): void {
    if (frame.id) {
      const pending = this.pending.get(frame.id);
      if (pending) {
        this.pending.delete(frame.id);
        pending.reject(new NetworkError(frame.error?.message ?? 'Server error'));
      }
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private scheduleReconnect(attempt = 0): void {
    if (attempt >= this.wsConfig.maxReconnectAttempts || this.manualClose) {
      this.state = 'disconnected';
      return;
    }

    this.state = 'reconnecting';
    const delay = Math.min(
      this.wsConfig.reconnectInterval * 2 ** attempt,
      this.wsConfig.reconnectIntervalMax,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        this.scheduleReconnect(attempt + 1);
      });
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
