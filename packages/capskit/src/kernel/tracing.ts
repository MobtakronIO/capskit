/**
 * Tracing infrastructure for CapsKit.
 * Provides async-safe trace emission with stdout/file sinks.
 */

import { TraceRecord } from '../types';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * AsyncLocalStorage for propagating trace context through nested calls.
 */
export const traceStorage = new AsyncLocalStorage<{ traceId: string; spanId: string }>();

/**
 * Check if tracing is enabled via environment variable.
 */
export function isTraceEnabled(): boolean {
  return process.env.CAPSKIT_TRACE === '1';
}

/**
 * Generate a new UUID v4.
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Trace sink interface for emitting trace records.
 */
export type TraceSink = (record: TraceRecord) => void;

/**
 * Non-blocking file sink using a write queue.
 * This prevents blocking the action execution path.
 */
export function createAsyncFileSink(filePath: string): TraceSink {
  let fd: number | null = null;
  let writeQueue: string[] = [];
  let isProcessing = false;
  let isClosed = false;

  // Bounded queue to prevent memory issues
  const MAX_QUEUE_SIZE = 1000;
  const MAX_RETRY_ATTEMPTS = 3;

  const tryOpen = () => {
    if (fd === null && !isClosed) {
      try {
        fd = fs.openSync(filePath, 'a');
      } catch {
        // File open failed - will try to open on next write
      }
    }
  };

  const processQueue = () => {
    if (isProcessing || isClosed) return;
    isProcessing = true;

    const processNext = () => {
      if (writeQueue.length === 0 || isClosed) {
        isProcessing = false;
        return;
      }

      const line = writeQueue.shift()!;

      if (fd !== null) {
        let attempts = 0;
        const writeWithRetry = () => {
          try {
            fs.writeSync(fd!, line);
            processNext();
          } catch {
            attempts++;
            if (attempts < MAX_RETRY_ATTEMPTS) {
              // Brief delay before retry
              setTimeout(writeWithRetry, 10);
            } else {
              // Drop the trace record after max retries
              // Don't crash - just silently drop
              isProcessing = false;
            }
          }
        };
        writeWithRetry();
      } else {
        // Try to open file
        tryOpen();
        if (fd !== null) {
          // Write the current line that was already shifted
          try {
            fs.writeSync(fd!, line);
            processNext();
          } catch {
            isProcessing = false;
          }
        } else {
          // Still can't open - drop and continue
          isProcessing = false;
        }
      }
    };

    processNext();
  };

  return (record: TraceRecord) => {
    if (isClosed) return;

    // Enqueue the line
    const line = JSON.stringify(record) + '\n';
    writeQueue.push(line);

    // Drop oldest entries if queue is too large (prevent memory exhaustion)
    if (writeQueue.length > MAX_QUEUE_SIZE) {
      writeQueue = writeQueue.slice(-MAX_QUEUE_SIZE);
    }

    // Trigger async processing
    processQueue();
  };
}

/**
 * Get the current trace sink based on environment configuration.
 */
export function getTraceSink(): TraceSink | null {
  if (!isTraceEnabled()) {
    return null;
  }

  const traceFile = process.env.CAPSKIT_TRACE_FILE;
  if (traceFile) {
    return createAsyncFileSink(traceFile);
  }

  // Default to stdout
  return (record: TraceRecord) => {
    try {
      process.stdout.write(JSON.stringify(record) + '\n');
    } catch {
      // Silently fail - tracing should not crash the action
    }
  };
}

/**
 * Emit a trace record via the configured sink.
 */
export function emitTrace(record: TraceRecord): void {
  const sink = getTraceSink();
  if (sink) {
    sink(record);
  }
}

/**
 * Wrap an action call with tracing.
 * Returns result first, then emits trace asynchronously (fire and forget).
 */
export async function traceCall<T>(
  action: string,
  payload: any,
  caller: string | null,
  fn: () => Promise<T>
): Promise<T> {
  const sink = getTraceSink();
  if (!sink) {
    return fn();
  }

  // Get or create trace context
  const parentContext = traceStorage.getStore();
  const traceId = parentContext?.traceId || generateUUID();
  const spanId = generateUUID();
  const parentSpanId = parentContext?.spanId || null;

  const timestampStart = new Date().toISOString();

  // Run the actual call within the trace context
  let result: T | undefined;
  let error: Error | null = null;
  let status: 'ok' | 'error' = 'ok';

  try {
    result = await traceStorage.run(
      { traceId, spanId },
      fn
    );
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
    status = 'error';
    throw error;
  } finally {
    const timestampEnd = new Date().toISOString();
    const durationMs = new Date(timestampEnd).getTime() - new Date(timestampStart).getTime();

    // Import redactPayload locally to avoid circular dependency issues
    const { redactPayload } = require('../types');

    // Build trace record
    const record: TraceRecord = {
      traceId,
      spanId,
      parentSpanId,
      timestampStart,
      timestampEnd,
      durationMs,
      action,
      caller,
      status,
      input: redactPayload(payload),
      output: error ? null : redactPayload(result),
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : null
    };

    // Emit trace - don't await, fire and forget
    emitTrace(record);
  }

  return result as T;
}
