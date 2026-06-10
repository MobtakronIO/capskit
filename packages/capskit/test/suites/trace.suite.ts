// @ts-nocheck

import { createCapsKit } from '../../src/capsule/kernel/create-capskit';
import { redactPayload } from '../../src/capsule/kernel/helpers/redact-payload.helper';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Trace tests - verifies trace emission, nesting, redaction, and sink fallback.
 */

export async function runTraceTests(kitFactory: (config: any) => Promise<any>) {
  console.log('\n=== Trace Tests ===');

  // Capture stdout for trace verification
  const originalWrite = process.stdout.write.bind(process.stdout);
  let stdoutData: string[] = [];

  // Helper to capture stdout
  const captureStdout = (fn: () => Promise<void>) => {
    stdoutData = [];
    process.stdout.write = (chunk: string) => {
      stdoutData.push(chunk);
      return true;
    };
    return fn().finally(() => {
      process.stdout.write = originalWrite;
    });
  };

  // Helper for file-based tests using real temp files
  const withTempTraceFile = (fn: (filePath: string) => Promise<void>) => {
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `capskit-trace-${Date.now()}.jsonl`);
    return fn(filePath).finally(async () => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    });
  };

  // Test 1: Trace emission when CAPSKIT_TRACE=1
  console.log('Test: trace emission when CAPSKIT_TRACE=1');
  {
    const prevTrace = process.env.CAPSKIT_TRACE;
    try {
      process.env.CAPSKIT_TRACE = '1';
      
      const result = await captureStdout(async () => {
        const kit = await kitFactory({
          capsules: [{
            type: 'manifest',
            manifest: {
              name: 'tracer',
              actions: {
                test: {
                  handler: async (input: any) => ({ result: input.body.value * 2 })
                }
              }
            }
          }]
        });
        
        const res = await kit.capskit.call('tracer.test', { body: { value: 21 } });
        if (res.result !== 42) {
          throw new Error(`Expected result 42, got ${res.result}`);
        }
      });

      // Verify trace was emitted
      if (stdoutData.length === 0) {
        throw new Error('No trace output captured');
      }

      // Parse the trace record
      const traceRecord = JSON.parse(stdoutData[0].trim());
      
      if (!traceRecord.traceId || traceRecord.traceId.length !== 36) {
        throw new Error(`Invalid traceId: ${traceRecord.traceId}`);
      }
      if (!traceRecord.spanId || traceRecord.spanId.length !== 36) {
        throw new Error(`Invalid spanId: ${traceRecord.spanId}`);
      }
      if (traceRecord.parentSpanId !== null) {
        throw new Error(`Expected null parentSpanId for top-level call, got ${traceRecord.parentSpanId}`);
      }
      if (traceRecord.action !== 'tracer.test') {
        throw new Error(`Expected action 'tracer.test', got ${traceRecord.action}`);
      }
      if (traceRecord.status !== 'ok') {
        throw new Error(`Expected status 'ok', got ${traceRecord.status}`);
      }
      if (traceRecord.durationMs < 0) {
        throw new Error(`Invalid durationMs: ${traceRecord.durationMs}`);
      }
      if (!traceRecord.timestampStart || !traceRecord.timestampEnd) {
        throw new Error('Missing timestamps');
      }
      
      console.log('✅ trace emission works');
    } finally {
      process.env.CAPSKIT_TRACE = prevTrace;
    }
  }

  // Test 2: Nested calls with correct traceId/parentSpanId
  console.log('Test: nested calls with correct traceId/parentSpanId');
  {
    const prevTrace = process.env.CAPSKIT_TRACE;
    try {
      process.env.CAPSKIT_TRACE = '1';
      
      const result = await captureStdout(async () => {
        const kit = await kitFactory({
          capsules: [{
            type: 'manifest',
            manifest: {
              name: 'parent',
              actions: {
                outer: {
                  handler: async (input: any, ctx: any) => {
                    // Call another action (nested)
                    const inner = await ctx.call('parent.inner', { body: { value: input.body.value } });
                    return { outer: input.body.value, inner: inner.value };
                  }
                },
                inner: {
                  handler: async (input: any) => ({ value: input.body.value + 1 })
                }
              }
            }
          }]
        });
        
        const res = await kit.capskit.call('parent.outer', { value: 10 });
        if (res.outer !== 10 || res.inner !== 11) {
          throw new Error(`Unexpected result: ${JSON.stringify(res)}`);
        }
      });

      // Should have 2 trace records
      if (stdoutData.length !== 2) {
        throw new Error(`Expected 2 trace records, got ${stdoutData.length}`);
      }

      // Parse traces - order may vary due to async emission
      const traces = stdoutData.map(line => JSON.parse(line.trim()));
      const outerTrace = traces.find(t => t.action === 'parent.outer');
      const innerTrace = traces.find(t => t.action === 'parent.inner');
      
      if (!outerTrace) throw new Error('No outer trace found');
      if (!innerTrace) throw new Error('No inner trace found');
      
      // Outer call is parent
      if (outerTrace.parentSpanId !== null) {
        throw new Error(`Expected null parentSpanId for outer call, got ${outerTrace.parentSpanId}`);
      }

      // Inner call has outer as parent
      if (innerTrace.parentSpanId !== outerTrace.spanId) {
        throw new Error(`Expected parentSpanId to be outer spanId, got ${innerTrace.parentSpanId}`);
      }
      if (innerTrace.traceId !== outerTrace.traceId) {
        throw new Error(`Expected same traceId for nested calls, got outer=${outerTrace.traceId} inner=${innerTrace.traceId}`);
      }

      console.log('✅ nested tracing works');
    } finally {
      process.env.CAPSKIT_TRACE = prevTrace;
    }
  }

  // Test 3: Payload redaction for sensitive keys
  console.log('Test: payload redaction for sensitive keys');
  {
    const prevTrace = process.env.CAPSKIT_TRACE;
    try {
      process.env.CAPSKIT_TRACE = '1';
      
      const result = await captureStdout(async () => {
        const kit = await kitFactory({
          capsules: [{
            type: 'manifest',
            manifest: {
              name: 'redact',
              actions: {
                sensitive: {
                  handler: async (input: any) => input
                }
              }
            }
          }]
        });
        
        await kit.capskit.call('redact.sensitive', {
          body: {
            username: 'john',
            password: 'secret123',
            token: 'abc123',
            apiKey: 'key-456',
            data: { secret: 'nested-secret' }
          }
        });
      });

      const traceRecord = JSON.parse(stdoutData[0].trim());
      const input = traceRecord.input;

      // Input body is nested under input.body based on call structure
      if (input.body.username !== 'john') {
        throw new Error(`username should not be redacted, got ${input.body?.username}`);
      }
      if (input.body.password !== '[REDACTED]') {
        throw new Error(`password should be [REDACTED], got ${input.body?.password}`);
      }
      if (input.body.token !== '[REDACTED]') {
        throw new Error(`token should be [REDACTED], got ${input.body?.token}`);
      }
      if (input.body.apiKey !== '[REDACTED]') {
        throw new Error(`apiKey should be [REDACTED], got ${input.body?.apiKey}`);
      }
      if (input.body.data?.secret !== '[REDACTED]') {
        throw new Error(`nested secret should be [REDACTED], got ${input.body?.data?.secret}`);
      }

      console.log('✅ payload redaction works');
    } finally {
      process.env.CAPSKIT_TRACE = prevTrace;
    }
  }

  // Test 4: Error capture in trace
  console.log('Test: error capture in trace');
  {
    const prevTrace = process.env.CAPSKIT_TRACE;
    try {
      process.env.CAPSKIT_TRACE = '1';
      
      const result = await captureStdout(async () => {
        const kit = await kitFactory({
          capsules: [{
            type: 'manifest',
            manifest: {
              name: 'error',
              actions: {
                fail: {
                  handler: async () => {
                    throw new Error('intentional failure');
                  }
                }
              }
            }
          }]
        });
        
        try {
          await kit.capskit.call('error.fail', { body: {} });
        } catch {
          // Expected
        }
      });

      const traceRecord = JSON.parse(stdoutData[0].trim());
      
      if (traceRecord.status !== 'error') {
        throw new Error(`Expected status 'error', got ${traceRecord.status}`);
      }
      if (traceRecord.error === null) {
        throw new Error('error should not be null');
      }
      if (!traceRecord.error.message.includes('intentional failure')) {
        throw new Error(`Expected error message to include 'intentional failure', got ${traceRecord.error.message}`);
      }
      if (traceRecord.output !== null) {
        throw new Error(`output should be null on error, got ${traceRecord.output}`);
      }

      console.log('✅ error capture works');
    } finally {
      process.env.CAPSKIT_TRACE = prevTrace;
    }
  }

  // Test 5: File sink with CAPSKIT_TRACE_FILE
  console.log('Test: file sink with CAPSKIT_TRACE_FILE');
  {
    const prevTrace = process.env.CAPSKIT_TRACE;
    const prevFile = process.env.CAPSKIT_TRACE_FILE;
    
    await withTempTraceFile(async (traceFile) => {
      try {
        process.env.CAPSKIT_TRACE = '1';
        process.env.CAPSKIT_TRACE_FILE = traceFile;
        
        const kit = await kitFactory({
          capsules: [{
            type: 'manifest',
            manifest: {
              name: 'filesink',
              actions: {
                test: {
                  handler: async (input: any) => ({ ok: true })
                }
              }
            }
          }]
        });
        
        await kit.capskit.call('filesink.test', { body: { x: 1 } });

        // Read the actual trace file
        const fileContent = fs.readFileSync(traceFile, 'utf-8');
        const lines = fileContent.trim().split('\n').filter(l => l.length > 0);
        
        if (lines.length !== 1) {
          throw new Error(`Expected 1 trace line, got ${lines.length}`);
        }

        const traceRecord = JSON.parse(lines[0]);
        if (traceRecord.action !== 'filesink.test') {
          throw new Error(`Expected action 'filesink.test', got ${traceRecord.action}`);
        }

        console.log('✅ file sink works');
      } finally {
        process.env.CAPSKIT_TRACE = prevTrace;
        process.env.CAPSKIT_TRACE_FILE = prevFile;
      }
    });
  }

  // Test 6: Sink fallback - action succeeds even if trace fails
  console.log('Test: sink fallback - action succeeds even if trace fails');
  {
    const prevTrace = process.env.CAPSKIT_TRACE;
    const prevFile = process.env.CAPSKIT_TRACE_FILE;
    try {
      process.env.CAPSKIT_TRACE = '1';
      process.env.CAPSKIT_TRACE_FILE = '/non/writable/path/trace.jsonl';
      
      // This should not throw even with unwritable path
      const result = await kitFactory({
        capsules: [{
          type: 'manifest',
          manifest: {
            name: 'fallback',
            actions: {
              test: {
                handler: async (input: any) => ({ success: true })
              }
            }
          }
        }]
      });
      
      // Should succeed despite file write failure
      const res = await result.capskit.call('fallback.test', { body: { x: 1 } });
      if (!res.success) {
        throw new Error('Action should still succeed');
      }

      console.log('✅ sink fallback works');
    } finally {
      process.env.CAPSKIT_TRACE = prevTrace;
      process.env.CAPSKIT_TRACE_FILE = prevFile;
    }
  }

  // Test 7: No trace when CAPSKIT_TRACE is not set
  console.log('Test: no trace when CAPSKIT_TRACE is not set');
  {
    const prevTrace = process.env.CAPSKIT_TRACE;
    try {
      delete process.env.CAPSKIT_TRACE;
      
      await captureStdout(async () => {
        const kit = await kitFactory({
          capsules: [{
            type: 'manifest',
            manifest: {
              name: 'notrace',
              actions: {
                test: {
                  handler: async (input: any) => ({ result: 1 })
                }
              }
            }
          }]
        });
        
        await kit.capskit.call('notrace.test', { body: {} });
      });

      // Should have no trace output (only the boot messages if any)
      const hasTraceOutput = stdoutData.some(d => {
        try {
          const parsed = JSON.parse(d.trim());
          return parsed.action === 'notrace.test';
        } catch {
          return false;
        }
      });

      if (hasTraceOutput) {
        throw new Error('Should not have trace output when CAPSKIT_TRACE is not set');
      }

      console.log('✅ no trace when disabled works');
    } finally {
      process.env.CAPSKIT_TRACE = prevTrace;
    }
  }

  // Test 8: Test redactPayload function directly
  console.log('Test: redactPayload function directly');
  {
    const testObj = {
      name: 'John',
      password: 'secret',
      nested: {
        token: 'abc',
        data: { key: 'value' }
      },
      arr: ['normal', { secret: 'hidden' }]
    };

    const redacted = redactPayload(testObj);

    if (redacted.name !== 'John') throw new Error('name should not be redacted');
    if (redacted.password !== '[REDACTED]') throw new Error('password should be redacted');
    if (redacted.nested.token !== '[REDACTED]') throw new Error('nested.token should be redacted');
    if (redacted.nested.data.key !== '[REDACTED]') throw new Error('nested.data.key should be redacted (key is in sensitive list)');
    if (redacted.arr[0] !== 'normal') throw new Error('arr[0] should not be redacted');
    if (redacted.arr[1].secret !== '[REDACTED]') throw new Error('arr[1].secret should be redacted');

    // Test null/undefined
    if (redactPayload(null) !== null) throw new Error('null should return null');
    if (redactPayload(undefined) !== undefined) throw new Error('undefined should return undefined');
    if (redactPayload(42) !== 42) throw new Error('number should return itself');

    console.log('✅ redactPayload works');
  }

  console.log('=== All Trace Tests Passed ===');
}
