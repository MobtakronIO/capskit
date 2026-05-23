import { describe, test, expect } from 'vitest';
import { createCapsKit } from '../../src/capsule/kernel/create-capskit';
import { createCapsKitPlatform } from '../../src/capsule/kernel/caps/platform.cap';

describe('Event Bus Fallback Logic', () => {
  test('legacy platform.emit routes directly to adapter eventBus when events capsule is missing', async () => {
    const mockEventBus = {
      emitted: [] as Array<{ event: string; data: any }>,
      emit(event: string, data: any) {
        this.emitted.push({ event, data });
      }
    };

    const { capskit } = await createCapsKit({
      capsules: [
        {
          type: 'manifest',
          manifest: {
            name: 'test-emitter',
            actions: {
              trigger: {
                handler: async (input: any, ctx: any) => {
                  ctx.emit('custom.event', { val: input.body.val });
                  return { success: true };
                }
              }
            }
          }
        }
      ],
      dependencies: {
        eventBus: mockEventBus
      }
    });

    // 1. Direct capskit.emit
    capskit.emit('direct.event', { foo: 'bar' });
    expect(mockEventBus.emitted.length).toBe(1);
    expect(mockEventBus.emitted[0]).toEqual({ event: 'direct.event', data: { foo: 'bar' } });

    // 2. ctx.emit from handler
    await capskit.call('test-emitter.trigger', { body: { val: 42 } });
    expect(mockEventBus.emitted.length).toBe(2);
    expect(mockEventBus.emitted[1]).toEqual({ event: 'custom.event', data: { val: 42 } });
  });

  test('new Cap-based platform.emit routes directly to state.dependencies.eventBus when events capsule is missing', async () => {
    const mockEventBus = {
      emitted: [] as Array<{ event: string; data: any }>,
      dispatch(event: string, data: any) {
        this.emitted.push({ event, data });
      }
    };

    const platform = await createCapsKitPlatform();
    
    // Wire dependency before booting
    platform.registerCapsule({
      name: 'new-emitter',
      caps: [
        {
          meta: {
            name: 'trigger'
          },
          handler: async (input: any, ctx: any) => {
            ctx.emit('new.custom.event', { val: input.body.val });
            return { success: true };
          }
        }
      ]
    });

    await platform.boot({
      dependencies: {
        eventBus: mockEventBus
      }
    });

    // 1. Direct platform.emit
    platform.emit('new.direct.event', { foo: 'baz' });
    expect(mockEventBus.emitted.length).toBe(1);
    expect(mockEventBus.emitted[0]).toEqual({ event: 'new.direct.event', data: { foo: 'baz' } });

    // 2. ctx.emit from handler
    await platform.call('new-emitter.trigger', { body: { val: 100 } });
    expect(mockEventBus.emitted.length).toBe(2);
    expect(mockEventBus.emitted[1]).toEqual({ event: 'new.custom.event', data: { val: 100 } });
  });
});
