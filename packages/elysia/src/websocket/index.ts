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
  /** Pre-existing EventBus from the CapsKit dependency system. When provided, this
   *  instance is used for WebSocket subscription dispatch instead of creating a new one,
   *  and no post-boot injection into state.dependencies is needed. */
  eventBus?: EventBus;
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

function getOrCreateState(eventBus?: EventBus): WSState {
  if (!wsState) {
    wsState = {
      clients: new Map(),
      eventBus: eventBus ?? createEventBus(),
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
  const state = getOrCreateState(options.eventBus);

  const sockets: Record<string, any> = {};

  sockets[path] = {
    open: async (ws: any) => {
      const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const client: WSClient = {
        id: clientId,
        ws,
        subscriptions: [],
      };
      state.clients.set(clientId, client);

      ws.send(makeFrame({ type: 'welcome', clientId }));
    },

    message: async (ws: any, rawMessage: any) => {
      let frame: WSClientFrame;
      try {
        frame = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
      } catch {
        ws.send(makeErrorFrame(errorEnvelope('PARSE_ERROR', 'Invalid JSON frame')));
        return;
      }

      const clientId = frame.clientId;
      if (!clientId) {
        console.log('Received message from unknown client (missing clientId)');
        return;
      }

      const client = state.clients.get(clientId);
      if (!client) {
        console.log('Received message from unknown client:', clientId);
        return;
      }

      try {
        switch (frame.type) {
          case 'call': {
            const startTime = Date.now();
            try {
              const capInput = {
                body: frame.payload as Record<string, unknown>,
                params: {} as Record<string, string>,
                query: {} as Record<string, string>,
              };
              const result = await capskit.call(frame.actionPath, capInput);
              ws.send(makeFrame({
                type: 'response',
                id: frame.id,
                ok: true,
                result,
                durationMs: Date.now() - startTime,
              }));
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error('[WS call error]', frame.actionPath, msg);
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

          case 'subscribe': {
            const subscription: WSSubscription = {
              id: frame.id,
              patterns: frame.patterns,
            };
            client.subscriptions.push(subscription);

            // Register with event bus
            state.eventBus.subscribe(
              {
                id: frame.id,
                patterns: frame.patterns,
                onEvent: (event: string, data: unknown, pattern: string) => {
                  // Only push to this specific client
                  // console.log('[WS eventBus] onEvent triggered:', event, '→ client', client.id);
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
      const client = [...state.clients.values()].find((c) => c.ws === ws);
      if (client) {
        for (const sub of client.subscriptions) {
          state.eventBus.unsubscribe(sub.id);
        }
        state.clients.delete(client.id);
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

export function resetState(): void {
  wsState = null;
}

export default createSocket;
