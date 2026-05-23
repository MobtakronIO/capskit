import { describe, test, expect } from 'vitest';
import { createSocket } from '../src/websocket';
import type { ICapsKit } from '@mobtakronio/capskit';

describe('WebSocket Event Routing and Subscriptions', () => {
  test('should handle client connection, subscription, event routing, unsubscription, and disconnection', async () => {
    // 1. Mock CapsKit Instance
    const mockState = {
      dependencies: {} as Record<string, any>
    };
    
    const emittedEvents: Array<{ event: string; data: any }> = [];
    
    const mockCapskit = {
      state: mockState,
      getManifests: () => [],
      call: async (action: string, payload?: any) => {
        return {};
      },
      emit: (event: string, data: any) => {
        emittedEvents.push({ event, data });
        // Delegate to injected eventBus if it exists
        const eventBus = mockState.dependencies.eventBus;
        if (eventBus) {
          eventBus.emit(event, data);
        }
      },
      getDependencies: () => mockState.dependencies,
    } as unknown as ICapsKit;

    // Create the socket handlers
    const sockets = createSocket(mockCapskit, { path: '/ws/capskit' });
    const wsHandler = sockets['/ws/capskit'];

    expect(wsHandler).toBeDefined();

    // 2. Mock WebSocket Client 1
    const ws1Sent: any[] = [];
    const mockWs1 = {
      readyState: 1,
      send: (data: string) => {
        ws1Sent.push(JSON.parse(data));
      }
    };

    // Open connection
    await wsHandler.open(mockWs1);
    expect(ws1Sent.length).toBe(1);
    expect(ws1Sent[0].type).toBe('welcome');
    const clientId1 = ws1Sent[0].clientId;
    expect(clientId1).toBeDefined();

    // 3. Subscribe Client 1 to 'market.*'
    const subFrame1 = {
      type: 'subscribe',
      clientId: clientId1,
      id: 'sub-frame-1',
      patterns: ['market.*']
    };
    await wsHandler.message(mockWs1, JSON.stringify(subFrame1));

    // Emit matching event
    mockCapskit.emit('market.btc', { price: 50000 });
    expect(ws1Sent.length).toBe(2);
    expect(ws1Sent[1].type).toBe('event');
    expect(ws1Sent[1].event).toBe('market.btc');
    expect(ws1Sent[1].data).toEqual({ price: 50000 });

    // Emit non-matching event
    mockCapskit.emit('user.login', { userId: 123 });
    expect(ws1Sent.length).toBe(2); // No new event sent

    // 4. Subscribe Client 1 to another pattern 'user.*' without overwriting 'market.*'
    const subFrame2 = {
      type: 'subscribe',
      clientId: clientId1,
      id: 'sub-frame-2',
      patterns: ['user.*']
    };
    await wsHandler.message(mockWs1, JSON.stringify(subFrame2));

    // Emit matching events for both
    mockCapskit.emit('market.eth', { price: 3000 });
    mockCapskit.emit('user.logout', { userId: 123 });

    expect(ws1Sent.length).toBe(4);
    // ws1Sent[2] should be market.eth
    expect(ws1Sent[2].event).toBe('market.eth');
    // ws1Sent[3] should be user.logout
    expect(ws1Sent[3].event).toBe('user.logout');

    // 5. Unsubscribe from 'user.*' (sub-frame-2)
    const unsubFrame = {
      type: 'unsubscribe',
      clientId: clientId1,
      id: 'sub-frame-2'
    };
    await wsHandler.message(mockWs1, JSON.stringify(unsubFrame));

    // Emit both events again
    mockCapskit.emit('market.sol', { price: 150 });
    mockCapskit.emit('user.update', { userId: 456 });

    // Client should only receive market.sol event, not user.update
    expect(ws1Sent.length).toBe(5);
    expect(ws1Sent[4].event).toBe('market.sol');

    // 6. Close connection and verify cleanup
    await wsHandler.close(mockWs1);
    
    // Emit event again, shouldn't be delivered
    mockCapskit.emit('market.ada', { price: 0.5 });
    expect(ws1Sent.length).toBe(5); // No new event sent
  });

  test('should handle client call with correct payload mapping to body', async () => {
    const mockState = {
      dependencies: {} as Record<string, any>
    };

    let lastCallArgs: { action: string; payload: any } | null = null;

    const mockCapskit = {
      state: mockState,
      getManifests: () => [],
      call: async (action: string, payload?: any) => {
        lastCallArgs = { action, payload };
        return { success: true, processedName: payload?.body?.name };
      },
      emit: () => {},
      getDependencies: () => mockState.dependencies,
    } as unknown as ICapsKit;

    const sockets = createSocket(mockCapskit, { path: '/ws/capskit' });
    const wsHandler = sockets['/ws/capskit'];

    const ws1Sent: any[] = [];
    const mockWs1 = {
      readyState: 1,
      send: (data: string) => {
        ws1Sent.push(JSON.parse(data));
      }
    };

    // Open connection
    await wsHandler.open(mockWs1);
    const clientId = ws1Sent[0].clientId;

    // Send call frame
    const callFrame = {
      type: 'call',
      clientId,
      id: 'call-1',
      actionPath: 'test.hello',
      payload: { name: 'Bob' }
    };
    await wsHandler.message(mockWs1, JSON.stringify(callFrame));

    // Verify call structure passed to capskit.call
    expect(lastCallArgs).not.toBeNull();
    expect(lastCallArgs!.action).toBe('test.hello');
    expect(lastCallArgs!.payload).toEqual({
      body: { name: 'Bob' },
      params: {},
      query: {}
    });

    // Verify response sent to client
    expect(ws1Sent.length).toBe(2);
    expect(ws1Sent[1]).toEqual({
      type: 'response',
      id: 'call-1',
      ok: true,
      result: { success: true, processedName: 'Bob' },
      durationMs: expect.any(Number)
    });
  });
});
