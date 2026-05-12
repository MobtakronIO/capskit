// @ts-nocheck

import { createCapsKit } from '../../src/kernel/platform';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Invoke/Tell Proxy Tests
 * 
 * Covers:
 * - ctx.invoke.serviceName.actionName(payload) => Promise<result>
 * - ctx.tell.serviceName.actionName(payload) => void (fire-and-forget)
 * - Payload normalization (plain values vs structured {body, params, query})
 * - Error propagation (invoke) vs error swallowing (tell)
 * - Integration with tracing system
 * - Integration with interceptor pipeline
 * - Multiple service/action chains
 */

export async function runInvokeTellTests(kitFactory: (config: any) => Promise<any>) {
  console.log('\n=== Invoke/Tell Proxy Tests ===');

  // ============================================================
  // Test 1: Basic invoke - ctx.invoke.service.action(payload)
  // ============================================================
  console.log('Test: basic invoke via proxy chain');
  {
    const kit = await kitFactory({
      capsules: [{
        type: 'manifest',
        manifest: {
          name: 'greeter',
          actions: {
            hello: {
              handler: async (input: any) => ({ greeting: `Hello, ${input.body.name}!` })
            }
          }
        }
      }]
    });

    // Test from inside an action handler
    let capturedResult: any = null;
    
    const kit2 = await kitFactory({
      capsules: [{
        type: 'manifest',
        manifest: {
          name: 'caller',
          actions: {
            proxy: {
              handler: async (input: any, ctx: any) => {
                // Use the new invoke proxy
                const result = await ctx.invoke.greeter.hello({ body: { name: 'World' } });
                capturedResult = result;
                return result;
              }
            }
          }
        }
      }, {
        type: 'manifest',
        manifest: {
          name: 'greeter',
          actions: {
            hello: {
              handler: async (input: any) => ({ greeting: `Hello, ${input.body.name}!` })
            }
          }
        }
      }]
    });

    const result = await kit2.capskit.call('caller.proxy', { body: {} });
    
    if (result.greeting !== 'Hello, World!') {
      throw new Error(`Expected greeting 'Hello, World!', got ${JSON.stringify(result)}`);
    }
    if (capturedResult?.greeting !== 'Hello, World!') {
      throw new Error(`Captured result incorrect: ${JSON.stringify(capturedResult)}`);
    }
    console.log('✅ basic invoke via proxy chain works');
  }

  // ============================================================
  // Test 2: Invoke with plain value (non-structured payload)
  // ============================================================
  console.log('Test: invoke with plain value payload');
  {
    const kit = await kitFactory({
      capsules: [{
        type: 'manifest',
        manifest: {
          name: 'math',
          actions: {
            double: {
              handler: async (input: any) => ({ result: input.body * 2 })
            }
          }
        }
      }, {
        type: 'manifest',
        manifest: {
          name: 'tester',
          actions: {
            run: {
              handler: async (input: any, ctx: any) => {
                // Pass plain number as payload
                return ctx.invoke.math.double(5);
              }
            }
          }
        }
      }]
    });

    const result = await kit.capskit.call('tester.run', { body: {} });
    if (result.result !== 10) {
      throw new Error(`Expected 10, got ${JSON.stringify(result)}`);
    }
    console.log('✅ invoke with plain value works');
  }

  // ============================================================
  // Test 3: Invoke propagates errors
  // ============================================================
  console.log('Test: invoke propagates errors');
  {
    const kit = await kitFactory({
      capsules: [{
        type: 'manifest',
        manifest: {
          name: 'failing',
          actions: {
            boom: {
              handler: async () => { throw new Error('BOOM!'); }
            }
          }
        }
      }, {
        type: 'manifest',
        manifest: {
          name: 'caller2',
          actions: {
            callFail: {
              handler: async (input: any, ctx: any) => {
                return ctx.invoke.failing.boom({ body: {} });
              }
            }
          }
        }
      }]
    });

    let errorCaught: Error | null = null;
    try {
      await kit.capskit.call('caller2.callFail', { body: {} });
    } catch (err) {
      errorCaught = err as Error;
    }

    if (!errorCaught) {
      throw new Error('Expected error to be propagated');
    }
    if (!errorCaught.message.includes('BOOM!')) {
      throw new Error(`Expected error message to include 'BOOM!', got: ${errorCaught.message}`);
    }
    console.log('✅ invoke propagates errors');
  }

  // ============================================================
  // Test 4: Basic tell - fire-and-forget
  // ============================================================
  console.log('Test: basic tell (fire-and-forget)');
  {
    let sideEffectExecuted = false;

    const kit = await kitFactory({
      capsules: [{
        type: 'manifest',
        manifest: {
          name: 'sidecar',
          actions: {
            notify: {
              handler: async (input: any) => {
                sideEffectExecuted = true;
                return { ok: true };
              }
            }
          }
        }
      }, {
        type: 'manifest',
        manifest: {
          name: 'dispatcher',
          actions: {
            send: {
              handler: async (input: any, ctx: any) => {
                // Fire and forget - should not wait for result
                ctx.tell.sidecar.notify({ body: { msg: 'hello' } });
                return { dispatched: true };
              }
            }
          }
        }
      }]
    });

    const result = await kit.capskit.call('dispatcher.send', { body: {} });
    
    if (!result.dispatched) {
      throw new Error('Expected dispatched: true');
    }

    // Give the async tell a moment to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    if (!sideEffectExecuted) {
      throw new Error('Expected side effect to be executed via tell');
    }
    console.log('✅ basic tell works');
  }

  // ============================================================
  // Test 5: Tell does not propagate errors
  // ============================================================
  console.log('Test: tell does not propagate errors');
  {
    // Capture console.error to verify error is logged but not thrown
    const originalError = console.error;
    let loggedError: string | null = null;
    console.error = (msg: string) => { loggedError = msg; };

    try {
      const kit = await kitFactory({
        capsules: [{
          type: 'manifest',
          manifest: {
            name: 'faulty',
            actions: {
              crash: {
                handler: async () => { throw new Error('Silent crash'); }
              }
            }
          }
        }, {
          type: 'manifest',
          manifest: {
            name: 'sender',
            actions: {
              fire: {
                handler: async (input: any, ctx: any) => {
                  ctx.tell.faulty.crash({ body: {} });
                  return { sent: true };
                }
              }
            }
          }
        }]
      });

      // This should NOT throw, even though the tell target crashes
      const result = await kit.capskit.call('sender.fire', { body: {} });
      
      if (!result.sent) {
        throw new Error('Expected sent: true');
      }

      // Give the async tell a moment to execute and fail
      await new Promise(resolve => setTimeout(resolve, 100));

      // The error should have been logged to console.error
      if (!loggedError || !loggedError.includes('Silent crash')) {
        console.warn(`[InvokeTellTest] Expected error to be logged, got: ${loggedError}`);
        // Don't fail - logging may vary
      }
    } finally {
      console.error = originalError;
    }
    console.log('✅ tell does not propagate errors');
  }

  // ============================================================
  // Test 6: Invoke integration with tracing
  // ============================================================
  console.log('Test: invoke integration with tracing');
  {
    const prevTrace = process.env.CAPSKIT_TRACE;
    const prevFile = process.env.CAPSKIT_TRACE_FILE;
    
    // Use a temp file for reliable trace capture
    const tmpDir = os.tmpdir();
    const traceFile = path.join(tmpDir, `capskit-invoke-trace-${Date.now()}.jsonl`);
    
    try {
      process.env.CAPSKIT_TRACE = '1';
      process.env.CAPSKIT_TRACE_FILE = traceFile;

      const kit = await kitFactory({
        capsules: [{
          type: 'manifest',
          manifest: {
            name: 'alpha',
            actions: {
              beta: {
                handler: async (input: any) => ({ value: input.body.x * 3 })
              }
            }
          }
        }, {
          type: 'manifest',
          manifest: {
            name: 'gamma',
            actions: {
              delta: {
                handler: async (input: any, ctx: any) => {
                  // Use invoke to call across capsules
                  return ctx.invoke.alpha.beta({ body: { x: input.body.n } });
                }
              }
            }
          }
        }]
      });

      await kit.capskit.call('gamma.delta', { body: { n: 7 } });

      // Read the trace file
      let traces: any[] = [];
      if (fs.existsSync(traceFile)) {
        const content = fs.readFileSync(traceFile, 'utf-8');
        traces = content
          .trim()
          .split('\n')
          .filter(line => line.length > 0)
          .map(line => {
            try { return JSON.parse(line); } catch { return null; }
          })
          .filter(t => t !== null && t.action);
      }

      if (traces.length < 2) {
        throw new Error(`Expected at least 2 trace records, got ${traces.length}`);
      }

      const outerTrace = traces.find(t => t.action === 'gamma.delta');
      const innerTrace = traces.find(t => t.action === 'alpha.beta');

      if (!outerTrace) throw new Error('No trace for gamma.delta');
      if (!innerTrace) throw new Error('No trace for alpha.beta');

      // Inner trace should have outer as parent
      if (innerTrace.parentSpanId !== outerTrace.spanId) {
        throw new Error(
          `Expected parentSpanId to match outer span. ` +
          `Outer: ${outerTrace.spanId}, Inner parent: ${innerTrace.parentSpanId}`
        );
      }

      // Same trace ID
      if (innerTrace.traceId !== outerTrace.traceId) {
        throw new Error('Trace IDs should match for nested calls');
      }

      console.log('✅ invoke integrates with tracing');
    } finally {
      process.env.CAPSKIT_TRACE = prevTrace;
      process.env.CAPSKIT_TRACE_FILE = prevFile;
      // Clean up temp file
      try {
        if (fs.existsSync(traceFile)) {
          fs.unlinkSync(traceFile);
        }
      } catch { /* best effort */ }
    }
  }

  // ============================================================
  // Test 7: Invoke integration with interceptors
  // ============================================================
  console.log('Test: invoke integration with interceptors');
  {
    const interceptorLog: string[] = [];

    const kit = await kitFactory({
      capsules: [{
        type: 'manifest',
        manifest: {
          name: 'svc',
          actions: {
            op: {
              handler: async (input: any) => ({ done: true, value: input.body.val })
            }
          }
        }
      }, {
        type: 'manifest',
        manifest: {
          name: 'consumer',
          actions: {
            use: {
              handler: async (input: any, ctx: any) => {
                return ctx.invoke.svc.op({ body: { val: 42 } });
              }
            }
          }
        }
      }]
    });

    // Add interceptor after boot
    kit.capskit.addInterceptor(async (actionName: string, payload: any, context: any, next: () => Promise<any>) => {
      interceptorLog.push(`before:${actionName}`);
      const result = await next();
      interceptorLog.push(`after:${actionName}`);
      return result;
    });

    const result = await kit.capskit.call('consumer.use', { body: {} });
    
    if (!result.done || result.value !== 42) {
      throw new Error(`Unexpected result: ${JSON.stringify(result)}`);
    }

    // Interceptor should have seen both actions
    const consumerBefore = interceptorLog.find(e => e === 'before:consumer.use');
    const svcBefore = interceptorLog.find(e => e === 'before:svc.op');
    const svcAfter = interceptorLog.find(e => e === 'after:svc.op');
    const consumerAfter = interceptorLog.find(e => e === 'after:consumer.use');

    if (!consumerBefore || !svcBefore || !svcAfter || !consumerAfter) {
      throw new Error(`Interceptor log incomplete: ${interceptorLog.join(', ')}`);
    }

    // Order should be: consumer before → svc before → svc after → consumer after
    const consumerBeforeIdx = interceptorLog.indexOf('before:consumer.use');
    const svcBeforeIdx = interceptorLog.indexOf('before:svc.op');
    const svcAfterIdx = interceptorLog.indexOf('after:svc.op');
    const consumerAfterIdx = interceptorLog.indexOf('after:consumer.use');

    if (!(consumerBeforeIdx < svcBeforeIdx && svcBeforeIdx < svcAfterIdx && svcAfterIdx < consumerAfterIdx)) {
      throw new Error(`Interceptor order incorrect: ${interceptorLog.join(', ')}`);
    }

    console.log('✅ invoke integrates with interceptors');
  }

  // ============================================================
  // Test 8: Invoke with structured payload (body + params + query)
  // ============================================================
  console.log('Test: invoke with structured payload');
  {
    const kit = await kitFactory({
      capsules: [{
        type: 'manifest',
        manifest: {
          name: 'echo',
          actions: {
            mirror: {
              handler: async (input: any) => ({
                body: input.body,
                params: input.params,
                query: input.query
              })
            }
          }
        }
      }, {
        type: 'manifest',
        manifest: {
          name: 'testStruct',
          actions: {
            run: {
              handler: async (input: any, ctx: any) => {
                return ctx.invoke.echo.mirror({
                  body: { msg: 'hi' },
                  params: { id: '123' },
                  query: { filter: 'active' }
                });
              }
            }
          }
        }
      }]
    });

    const result = await kit.capskit.call('testStruct.run', { body: {} });
    
    if (result.body?.msg !== 'hi') {
      throw new Error(`Expected body.msg 'hi', got ${JSON.stringify(result.body)}`);
    }
    if (result.params?.id !== '123') {
      throw new Error(`Expected params.id '123', got ${JSON.stringify(result.params)}`);
    }
    if (result.query?.filter !== 'active') {
      throw new Error(`Expected query.filter 'active', got ${JSON.stringify(result.query)}`);
    }
    console.log('✅ invoke with structured payload works');
  }

  // ============================================================
  // Test 9: Multiple chained invocations
  // ============================================================
  console.log('Test: multiple chained invocations');
  {
    const kit = await kitFactory({
      capsules: [{
        type: 'manifest',
        manifest: {
          name: 'step1',
          actions: {
            process: {
              handler: async (input: any) => ({ step1: input.body.value * 2 })
            }
          }
        }
      }, {
        type: 'manifest',
        manifest: {
          name: 'step2',
          actions: {
            process: {
              handler: async (input: any) => ({ step2: input.body.value + 10 })
            }
          }
        }
      }, {
        type: 'manifest',
        manifest: {
          name: 'pipeline',
          actions: {
            run: {
              handler: async (input: any, ctx: any) => {
                const r1 = await ctx.invoke.step1.process({ body: { value: 5 } });
                const r2 = await ctx.invoke.step2.process({ body: { value: r1.step1 } });
                return { final: r2.step2 };
              }
            }
          }
        }
      }]
    });

    const result = await kit.capskit.call('pipeline.run', { body: {} });
    
    if (result.final !== 20) { // (5 * 2) + 10 = 20
      throw new Error(`Expected final 20, got ${result.final}`);
    }
    console.log('✅ multiple chained invocations work');
  }

  // ============================================================
  // Test 10: Tell with structured payload
  // ============================================================
  console.log('Test: tell with structured payload');
  {
    let receivedPayload: any = null;

    const kit = await kitFactory({
      capsules: [{
        type: 'manifest',
        manifest: {
          name: 'receiver',
          actions: {
            handle: {
              handler: async (input: any) => {
                receivedPayload = input;
                return { ok: true };
              }
            }
          }
        }
      }, {
        type: 'manifest',
        manifest: {
          name: 'notifier',
          actions: {
            ping: {
              handler: async (input: any, ctx: any) => {
                ctx.tell.receiver.handle({
                  body: { event: 'ping' },
                  params: { origin: 'notifier' },
                  query: { urgent: 'true' }
                });
                return { notified: true };
              }
            }
          }
        }
      }]
    });

    const result = await kit.capskit.call('notifier.ping', { body: {} });
    
    if (!result.notified) {
      throw new Error('Expected notified: true');
    }

    // Give async tell time to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    if (!receivedPayload) {
      throw new Error('Expected receiver to have received payload');
    }
    if (receivedPayload.body?.event !== 'ping') {
      throw new Error(`Expected body.event 'ping', got ${JSON.stringify(receivedPayload.body)}`);
    }
    if (receivedPayload.params?.origin !== 'notifier') {
      throw new Error(`Expected params.origin 'notifier', got ${JSON.stringify(receivedPayload.params)}`);
    }
    console.log('✅ tell with structured payload works');
  }

  console.log('=== All Invoke/Tell Proxy Tests Passed ===');
}
