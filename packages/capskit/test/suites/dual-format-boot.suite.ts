// @ts-nocheck

import { convertCapToManifest, convertRegistryToManifest } from '../../src/capsule/kernel';
import type { CapDefinition, CapsuleRegistry } from '../../src/capsule/kernel';

/**
 * Dual-Format Boot Integration Tests
 *
 * Verifies the kernel can boot capsules from both old-style (manifest) and
 * new-style (Cap-based) formats side-by-side, including:
 * - Booting with only old-style capsules
 * - Booting with only new-style capsules (single cap and registry)
 * - Booting with mixed old and new capsules
 * - Dependency/communication across formats (runtime ctx.call / ctx.invoke)
 * - Event routing across formats
 */

export async function runDualFormatBootTests(kitFactory: (config: any) => Promise<any>) {
  console.log('\n=== Dual-Format Boot Tests ===');

  // ============================================================
  // Test 1: Boot with only old-style (manifest) capsules
  // ============================================================
  console.log('Test: boot with only old-style manifest capsules');
  {
    const kit = await kitFactory({
      capsules: [
        {
          type: 'manifest',
          manifest: {
            name: 'alpha',
            actions: {
              ping: {
                handler: async (input: any) => ({ pong: true, from: 'alpha' })
              }
            }
          }
        },
        {
          type: 'manifest',
          manifest: {
            name: 'beta',
            actions: {
              greet: {
                handler: async (input: any) => ({ hello: input.body.name, from: 'beta' })
              }
            }
          }
        }
      ]
    });

    const kitInstance = kit.capskit;
    const result = await kitInstance.call('beta.greet', { body: { name: 'World' } });
    if (result.hello !== 'World' || result.from !== 'beta') {
      throw new Error(`Unexpected result: ${JSON.stringify(result)}`);
    }

    // Verify both capsules are registered
    const manifests = kitInstance.getManifests();
    const alphaManifest = manifests.find((m: any) => m.name === 'alpha');
    const betaManifest = manifests.find((m: any) => m.name === 'beta');
    if (!alphaManifest || !betaManifest) {
      throw new Error('Both alpha and beta should be registered');
    }
    console.log('✅ old-style manifest capsules boot correctly');
  }

  // ============================================================
  // Test 2: Boot with only new-style (Cap-based) capsules
  // ============================================================
  console.log('Test: boot with only new-style Cap-based capsules');
  {
    class WorkerCap {
      async process(input: any, ctx: any) {
        return { processed: true, data: input.body.items, from: 'worker' };
      }
    }

    const capDef: CapDefinition = {
      class: WorkerCap,
      meta: {
        name: 'worker',
        events: { publishes: ['work.done'] }
      }
    };

    const workerManifest = convertCapToManifest(capDef);

    const kit = await kitFactory({
      capsules: [
        { type: 'manifest', manifest: workerManifest }
      ]
    });

    const kitInstance = kit.capskit;
    const result = await kitInstance.call('worker.process', { body: { items: [1, 2, 3] } });
    if (!result.processed || result.data.length !== 3) {
      throw new Error(`Unexpected result: ${JSON.stringify(result)}`);
    }
    if (!result.from || result.from !== 'worker') {
      throw new Error(`Expected from: 'worker', got: ${JSON.stringify(result)}`);
    }

    // Verify it appears in manifests list
    const manifests = kitInstance.getManifests();
    const workerEntry = manifests.find((m: any) => m.name === 'worker');
    if (!workerEntry) {
      throw new Error('worker capsule should be registered');
    }
    console.log('✅ new-style Cap-based capsule boots correctly');
  }

  // ============================================================
  // Test 3: Boot with only new-style registry capsules
  // ============================================================
  console.log('Test: boot with only new-style CapsuleRegistry');
  {
    class AddCap {
      async add(input: any, ctx: any) {
        return { result: input.body.a + input.body.b };
      }
    }

    class MultiplyCap {
      async multiply(input: any, ctx: any) {
        return { result: input.body.a * input.body.b };
      }
    }

    const registry: CapsuleRegistry = {
      name: 'math',
      caps: [
        { class: AddCap, meta: { name: 'adder' } },
        { class: MultiplyCap, meta: { name: 'multiplier' } }
      ]
    };

    const mathManifest = convertRegistryToManifest(registry);

    const kit = await kitFactory({
      capsules: [
        { type: 'manifest', manifest: mathManifest }
      ]
    });

    const kitInstance = kit.capskit;
    const addResult = await kitInstance.call('math.add', { body: { a: 7, b: 3 } });
    if (addResult.result !== 10) {
      throw new Error(`Expected 10, got ${addResult.result}`);
    }

    const mulResult = await kitInstance.call('math.multiply', { body: { a: 4, b: 5 } });
    if (mulResult.result !== 20) {
      throw new Error(`Expected 20, got ${mulResult.result}`);
    }
    console.log('✅ CapsuleRegistry with multiple caps boots correctly');
  }

  // ============================================================
  // Test 4: Boot with mixed old and new capsules
  // ============================================================
  console.log('Test: boot with mixed old and new capsules side-by-side');
  {
    // Old-style manifest capsule
    const oldStyleManifest = {
      name: 'legacy-auth',
      actions: {
        verify: {
          handler: async (input: any) => ({
            valid: true,
            user: input.body.userId,
            from: 'legacy-auth'
          })
        }
      },
      events: { publishes: ['user.authenticated'] }
    };

    // New-style Cap-based capsule
    class NewDashboardCap {
      async render(input: any, ctx: any) {
        return { rendered: true, userId: input.body.userId, from: 'dashboard' };
      }
    }

    const dashboardDef: CapDefinition = {
      class: NewDashboardCap,
      meta: {
        name: 'dashboard',
        events: { subscribes: [{ event: 'user.authenticated', action: 'render' }] }
      }
    };

    const dashboardManifest = convertCapToManifest(dashboardDef);

    const kit = await kitFactory({
      capsules: [
        { type: 'manifest', manifest: oldStyleManifest },
        { type: 'manifest', manifest: dashboardManifest }
      ]
    });

    const kitInstance = kit.capskit;

    // Both should work
    const authResult = await kitInstance.call('legacy-auth.verify', { body: { userId: '42' } });
    if (!authResult.valid || authResult.user !== '42') {
      throw new Error(`Auth failed: ${JSON.stringify(authResult)}`);
    }

    const dashResult = await kitInstance.call('dashboard.render', { body: { userId: '42' } });
    if (!dashResult.rendered) {
      throw new Error(`Dashboard render failed: ${JSON.stringify(dashResult)}`);
    }

    // Both should appear in manifests
    const manifests = kitInstance.getManifests();
    if (!manifests.find((m: any) => m.name === 'legacy-auth')) {
      throw new Error('legacy-auth should be registered');
    }
    if (!manifests.find((m: any) => m.name === 'dashboard')) {
      throw new Error('dashboard should be registered');
    }
    console.log('✅ mixed old and new capsules boot side-by-side');
  }

  // ============================================================
  // Test 5: Runtime cross-format communication
  //        (old-style calls new-style via ctx.call)
  // ============================================================
  console.log('Test: old-style capsule calls new-style capsule at runtime');
  {
    class DataServiceCap {
      async query(input: any, ctx: any) {
        return { rows: [{ id: 1, name: 'foo' }], from: 'data-service' };
      }
    }

    const dataServiceDef: CapDefinition = {
      class: DataServiceCap,
      meta: { name: 'data-service' }
    };

    const dataServiceManifest = convertCapToManifest(dataServiceDef);

    const oldStyleManifest = {
      name: 'reporter',
      actions: {
        report: {
          handler: async (input: any, ctx: any) => {
            const data = await ctx.call('data-service.query', { body: {} });
            return { report: `Got ${data.rows.length} rows`, from: 'reporter' };
          }
        }
      }
    };

    const kit = await kitFactory({
      capsules: [
        { type: 'manifest', manifest: dataServiceManifest },
        { type: 'manifest', manifest: oldStyleManifest }
      ]
    });

    const kitInstance = kit.capskit;
    const result = await kitInstance.call('reporter.report', { body: {} });
    if (!result.report || !result.report.includes('1 rows')) {
      throw new Error(`Unexpected report: ${JSON.stringify(result)}`);
    }
    console.log('✅ old-style calls new-style at runtime works');
  }

  // ============================================================
  // Test 6: Runtime cross-format communication
  //        (new-style calls old-style via ctx.call)
  // ============================================================
  console.log('Test: new-style capsule calls old-style capsule at runtime');
  {
    const oldStyleManifest = {
      name: 'configProvider',
      actions: {
        getConfig: {
          handler: async (input: any) => ({
            theme: 'dark',
            locale: 'en',
            from: 'configProvider'
          })
        }
      }
    };

    class UiRendererCap {
      async render(input: any, ctx: any) {
        const config = await ctx.call('configProvider.getConfig', { body: {} });
        return { rendered: true, theme: config.theme, from: 'uiRenderer' };
      }
    }

    const uiRendererDef: CapDefinition = {
      class: UiRendererCap,
      meta: {
        name: 'uiRenderer',
        dependencies: []
      }
    };

    const uiRendererManifest = convertCapToManifest(uiRendererDef);

    const kit = await kitFactory({
      capsules: [
        { type: 'manifest', manifest: oldStyleManifest },
        { type: 'manifest', manifest: uiRendererManifest }
      ]
    });

    const kitInstance = kit.capskit;
    const result = await kitInstance.call('uiRenderer.render', { body: {} });
    if (result.theme !== 'dark') {
      throw new Error(`Expected dark theme, got: ${JSON.stringify(result)}`);
    }
    console.log('✅ new-style calls old-style at runtime works');
  }

  // ============================================================
  // Test 7: Event routing across formats
  //         (old-style publishes, new-style subscribes)
  // ============================================================
  console.log('Test: event routing - old publishes, new subscribes');
  {
    // Old-style: emitter
    const emitterManifest = {
      name: 'emitter',
      actions: {
        fire: {
          handler: async (input: any, ctx: any) => {
            ctx.emit('order.created', { orderId: input.body.orderId });
            return { fired: true };
          }
        }
      },
      events: { publishes: ['order.created'] }
    };

    // New-style: handler that stores received events
    const receivedEvents: any[] = [];

    class OrderHandlerCap {
      async handle(input: any, ctx: any) {
        receivedEvents.push({ event: 'order.created', payload: input.body, raw: input });
        return { handled: true };
      }
    }

    const handlerDef: CapDefinition = {
      class: OrderHandlerCap,
      meta: {
        name: 'order-handler',
        events: { subscribes: [{ event: 'order.created', action: 'handle' }] }
      }
    };

    const handlerManifest = convertCapToManifest(handlerDef);

    const kit = await kitFactory({
      capsules: [
        { type: 'manifest', manifest: emitterManifest },
        { type: 'manifest', manifest: handlerManifest }
      ]
    });

    const kitInstance = kit.capskit;

    // Fire event
    await kitInstance.call('emitter.fire', { body: { orderId: 'ORD-123' } });

    // Wait for async event dispatch
    await new Promise(resolve => setTimeout(resolve, 100));

    if (receivedEvents.length === 0) {
      throw new Error('Expected order-handler to receive event');
    }
    if (receivedEvents[0].event !== 'order.created') {
      throw new Error(`Expected order.created event, got ${receivedEvents[0].event}`);
    }
    console.log('✅ old publishes, new subscribes works');
  }

  // ============================================================
  // Test 8: Event routing across formats
  //         (new-style publishes, old-style subscribes)
  // ============================================================
  console.log('Test: event routing - new publishes, old subscribes');
  {
    // New-style: emitter
    class NotifierCap {
      async notify(input: any, ctx: any) {
        ctx.emit('notification.sent', { message: input.body.message });
        return { sent: true };
      }
    }

    const notifierDef: CapDefinition = {
      class: NotifierCap,
      meta: {
        name: 'notifier',
        events: { publishes: ['notification.sent'] }
      }
    };

    const notifierManifest = convertCapToManifest(notifierDef);

    // Old-style: listener
    const receivedNotifications: any[] = [];

    const listenerManifest = {
      name: 'notification-listener',
      actions: {
        onNotification: {
          handler: async (input: any, ctx: any) => {
            receivedNotifications.push({ message: input.body?.message, raw: input });
            return { acknowledged: true };
          }
        }
      },
      events: { subscribes: [{ event: 'notification.sent', action: 'onNotification' }] }
    };

    const kit = await kitFactory({
      capsules: [
        { type: 'manifest', manifest: notifierManifest },
        { type: 'manifest', manifest: listenerManifest }
      ]
    });

    const kitInstance = kit.capskit;

    // Fire event from new-style cap
    await kitInstance.call('notifier.notify', { body: { message: 'Hello from Cap!' } });

    // Wait for async event dispatch
    await new Promise(resolve => setTimeout(resolve, 100));

    if (receivedNotifications.length === 0) {
      throw new Error('Expected notification-listener to receive event');
    }
    if (receivedNotifications[0].message !== 'Hello from Cap!') {
      throw new Error(`Expected "Hello from Cap!", got: ${JSON.stringify(receivedNotifications[0])}`);
    }
    console.log('✅ new publishes, old subscribes works');
  }

  // ============================================================
  // Test 9: Bidirectional event routing across formats
  // ============================================================
  console.log('Test: bidirectional event routing across formats');
  {
    const crossFormatEvents: string[] = [];

    // Old-style capsule
    const oldCapsule = {
      name: 'old-producer',
      actions: {
        produce: {
          handler: async (input: any, ctx: any) => {
            ctx.emit('old.produced', { value: input.body.value });
            return { produced: true };
          }
        },
        consumeFromNew: {
          handler: async (input: any, ctx: any) => {
            crossFormatEvents.push('old-received-new');
            return { consumed: true };
          }
        }
      },
      events: {
        publishes: ['old.produced'],
        subscribes: [{ event: 'new.produced', action: 'consumeFromNew' }]
      }
    };

    // New-style capsule
    class NewProducerCap {
      async produce(input: any, ctx: any) {
        ctx.emit('new.produced', { value: input.body.value });
        return { produced: true };
      }

      async consumeFromOld(input: any, ctx: any) {
        crossFormatEvents.push('new-received-old');
        return { consumed: true };
      }
    }

    const newProducerDef: CapDefinition = {
      class: NewProducerCap,
      meta: {
        name: 'new-producer',
        events: {
          publishes: ['new.produced'],
          subscribes: [{ event: 'old.produced', action: 'consumeFromOld' }]
        }
      }
    };

    const newProducerManifest = convertCapToManifest(newProducerDef);

    const kit = await kitFactory({
      capsules: [
        { type: 'manifest', manifest: oldCapsule },
        { type: 'manifest', manifest: newProducerManifest }
      ]
    });

    const kitInstance = kit.capskit;

    // Old publishes, new subscribes
    await kitInstance.call('old-producer.produce', { body: { value: 100 } });
    await new Promise(resolve => setTimeout(resolve, 100));

    // New publishes, old subscribes
    await kitInstance.call('new-producer.produce', { body: { value: 200 } });
    await new Promise(resolve => setTimeout(resolve, 100));

    if (crossFormatEvents.length < 2) {
      throw new Error(`Expected 2 cross-format events, got ${crossFormatEvents.length}: ${crossFormatEvents}`);
    }
    if (!crossFormatEvents.includes('new-received-old')) {
      throw new Error('New capsule should have received event from old');
    }
    if (!crossFormatEvents.includes('old-received-new')) {
      throw new Error('Old capsule should have received event from new');
    }
    console.log('✅ bidirectional event routing across formats works');
  }

  // ============================================================
  // Test 10: Three-format coexistence with runtime interaction
  // ============================================================
  console.log('Test: three-format coexistence with runtime interaction');
  {
    // Old-style: base service
    const baseService = {
      name: 'baseService',
      actions: {
        init: {
          handler: async (input: any) => ({ initialized: true, from: 'base' })
        }
      },
      events: { publishes: ['base.ready'] }
    };

    // Cap directory style: middleware
    class MiddlewareCap {
      async process(input: any, ctx: any) {
        const base = await ctx.call('baseService.init', { body: {} });
        ctx.emit('middleware.processed', { result: base });
        return { processed: true, baseStatus: base.initialized };
      }
    }

    const middlewareDef: CapDefinition = {
      class: MiddlewareCap,
      meta: {
        name: 'middleware',
        events: {
          publishes: ['middleware.processed'],
          subscribes: [{ event: 'base.ready', action: 'process' }]
        }
      }
    };

    const middlewareManifest = convertCapToManifest(middlewareDef);

    // Registry style: consumer
    class ConsumerCap {
      async finalize(input: any, ctx: any) {
        return { final: true, from: 'consumer' };
      }
    }

    const consumerRegistry: CapsuleRegistry = {
      name: 'consumer-service',
      caps: [
        {
          class: ConsumerCap,
          meta: {
            name: 'consumer',
            events: {
              subscribes: [{ event: 'middleware.processed', action: 'finalize' }]
            }
          }
        }
      ]
    };

    const consumerManifest = convertRegistryToManifest(consumerRegistry);

    const kit = await kitFactory({
      capsules: [
        { type: 'manifest', manifest: baseService },
        { type: 'manifest', manifest: middlewareManifest },
        { type: 'manifest', manifest: consumerManifest }
      ]
    });

    const kitInstance = kit.capskit;

    // Direct call to base (old-style)
    const baseResult = await kitInstance.call('baseService.init', { body: {} });
    if (!baseResult.initialized) {
      throw new Error('baseService.init failed');
    }

    // Direct call to middleware (cap-style)
    const midResult = await kitInstance.call('middleware.process', { body: {} });
    if (!midResult.processed || !midResult.baseStatus) {
      throw new Error(`middleware.process failed: ${JSON.stringify(midResult)}`);
    }

    // Verify all three are registered
    const manifests = kitInstance.getManifests();
    const names = manifests.map((m: any) => m.name);
    if (!names.includes('baseService') || !names.includes('middleware') || !names.includes('consumer-service')) {
      throw new Error(`Missing capsules. Found: ${names.join(', ')}`);
    }
    console.log('✅ three-format coexistence with runtime interaction works');
  }

  console.log('=== All Dual-Format Boot Tests Passed ===');
}
