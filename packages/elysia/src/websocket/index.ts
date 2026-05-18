import type { ICapsKit, CapsuleManifest, EventBus } from '@mobtakronio/capskit';
import { createEventBus } from '@mobtakronio/capskit';
import type {
  WSServerFrame,
  WSErrorEnvelope,
  WSSubscription,
  WSClientFrame,
} from '@mobtakronio/capskit';
import { handleWebSocketError } from '../shared';
import type { WebSocketOptions } from '../shared';

export { WebSocketOptions };

export interface WebSocketAdapterOptions extends WebSocketOptions {
  /** WebSocket path. Default: '/ws/capskit' */
  path?: string;
}

interface WSClient {
  id: string;
  ws: any;
  subscriptions: WSSubscription[];
}

interface WSState {
  clients: Map<string, WSClient>;
  eventBus: EventBus;
}

let wsState: WSState | null = null;

function getOrCreateState(): WSState {
  if (!wsState) {
    wsState = {
      clients: new Map(),
      eventBus: createEventBus(),
    };
  }
  return wsState;
}

function makeFrame(frame: WSServerFrame): string {
  return JSON.stringify(frame);
}

function makeErrorFrame(error: WSErrorEnvelope, id?: string): string {
  return JSON.stringify({ type: 'error', id, error } as WSServerFrame);
}

function errorEnvelope(code: string, message: string, status?: number): WSErrorEnvelope {
  return { code, message, status };
}

export function createSocket(capskit: ICapsKit, options: WebSocketAdapterOptions = {}) {
  const { path = '/ws/capskit' } = options;
  const state = getOrCreateState();

  const sockets: Record<string, any> = {};

  sockets[path] = {
    open: async (ws: any) => {
      const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      ws.data = { clientId };

      const client: WSClient = {
        id: clientId,
        ws,
        subscriptions: [],
      };
      state.clients.set(clientId, client);

      // Subscribe client to event bus — events are pushed via onEvent callback
      // Subscriptions are added when client sends subscribe frames
    },

    message: async (ws: any, rawMessage: any) => {
      const clientId = ws.data?.clientId;
      if (!clientId) return;

      const client = state.clients.get(clientId);
      if (!client) return;

      let frame: WSClientFrame;
      try {
        frame = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
      } catch {
        ws.send(makeErrorFrame(errorEnvelope('PARSE_ERROR', 'Invalid JSON frame')));
        return;
      }

      try {
        switch (frame.type) {
          case 'call': {
            const startTime = Date.now();
            try {
              const result = await capskit.call(frame.actionPath, frame.payload);
              ws.send(makeFrame({
                type: 'response',
                id: frame.id,
                ok: true,
                result,
                durationMs: Date.now() - startTime,
              }));
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              ws.send(makeFrame({
                type: 'response',
                id: frame.id,
                ok: false,
                error: errorEnvelope('ACTION_ERROR', msg),
                durationMs: Date.now() - startTime,
              }));
            }
            break;
          }

          case 'emit': {
            capskit.emit(frame.event, frame.data);
            break;
          }

          case 'tell': {
            capskit.tell(frame.actionPath, frame.payload);
            break;
          }

          case 'subscribe': {
            const subscription: WSSubscription = {
              id: frame.id,
              patterns: frame.patterns,
            };
            client.subscriptions.push(subscription);

            // Register with event bus
            state.eventBus.subscribe(
              {
                id: clientId,
                patterns: frame.patterns,
                onEvent: (event: string, data: unknown, pattern: string) => {
                  // Only push to this specific client
                  if (client.ws.readyState === 1) {
                    client.ws.send(makeFrame({
                      type: 'event',
                      pattern,
                      event,
                      data,
                    }));
                  }
                },
              },
              frame.patterns,
            );
            break;
          }

          case 'unsubscribe': {
            const subIndex = client.subscriptions.findIndex(s => s.id === frame.id);
            if (subIndex !== -1) {
              client.subscriptions.splice(subIndex, 1);
            }
            state.eventBus.unsubscribe(frame.id);
            break;
          }

          case 'describe': {
            const manifests = capskit.getManifests();
            ws.send(makeFrame({
              type: 'manifest',
              id: frame.id,
              data: manifests,
            }));
            break;
          }

          default:
            ws.send(makeErrorFrame(
              errorEnvelope('UNKNOWN_FRAME', `Unknown frame type: "${(frame as any).type}"`),
              'id' in frame ? (frame as any).id : undefined,
            ));
        }
      } catch (err) {
        handleWebSocketError(err, ws, 'message');
      }
    },

    close: async (ws: any) => {
      const clientId = ws.data?.clientId;
      if (clientId) {
        const client = state.clients.get(clientId);
        if (client) {
          // Unsubscribe from all patterns
          for (const sub of client.subscriptions) {
            state.eventBus.unsubscribe(sub.id);
          }
          state.clients.delete(clientId);
        }
      }
    },
  };

  return sockets;
}

export function getEventBus(): EventBus | null {
  return wsState?.eventBus ?? null;
}

export function getConnectedClients(): number {
  return wsState?.clients.size ?? 0;
}

export default createSocket;
