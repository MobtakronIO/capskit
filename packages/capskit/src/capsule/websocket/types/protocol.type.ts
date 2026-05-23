import { CapsuleManifest } from '../../kernel/types/capsule-manifest.type';

// ── Error envelope (shared with backend errors.ts) ──
export interface WSErrorEnvelope {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
  stack?: string;
}

// ── Client → Server frames ──

export interface WSCallFrame {
  type: 'call';
  clientId: string;
  id: string;
  capPath?: string;
  actionPath: string;
  payload: unknown;
}

export interface WSEmitFrame {
  type: 'emit';
  clientId: string;
  event: string;
  data: unknown;
}

export interface WSSubscribeFrame {
  type: 'subscribe';
  clientId: string;
  id: string;
  patterns: string[];
}

export interface WSUnsubscribeFrame {
  type: 'unsubscribe';
  clientId: string;
  id: string;
}

export interface WSDescribeFrame {
  type: 'describe';
  clientId: string;
  id: string;
}

export type WSClientFrame =
  | WSCallFrame
  | WSEmitFrame
  | WSSubscribeFrame
  | WSUnsubscribeFrame
  | WSDescribeFrame;

// ── Server → Client frames ──

export interface WSResponseFrame {
  type: 'response';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: WSErrorEnvelope;
  durationMs?: number;
}

export interface WSEventFrame {
  type: 'event';
  pattern: string;
  event: string;
  data: unknown;
}

export interface WSManifestFrame {
  type: 'manifest';
  id: string;
  data: CapsuleManifest[];
}

export interface WSErrorFrame {
  type: 'error';
  id?: string;
  error: WSErrorEnvelope;
}

export interface WSWelcomeFrame {
  type: 'welcome';
  clientId: string;
}

export type WSServerFrame =
  | WSResponseFrame
  | WSEventFrame
  | WSManifestFrame
  | WSErrorFrame
  | WSWelcomeFrame;

// ── Union of all frames ──

export type WSFrame = WSClientFrame | WSServerFrame;

// ── Subscription handle ──

export interface WSSubscription {
  id: string;
  patterns: string[];
}

// ── WS connection state ──

export interface WSConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  reconnectAttempts: number;
  lastError?: WSErrorEnvelope;
}
