/**
 * Tracing infrastructure for CapsKit.
 * Provides async-safe trace emission with stdout/file sinks.
 */

import { TraceRecord, redactPayload } from '../types';
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
 * A closable trace sink that extends TraceSink with a close() method.
 */
export interface ClosableTraceSink extends TraceSink {
  close(): void;
}

/**
 * Non-blocking file sink using a write queue.
 * This prevents blocking the action execution path.
 * Returns a ClosableTraceSink with a close() method to properly release the file descriptor.
 */
export function createAsyncFileSink(filePath: string): ClosableTraceSink {
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

  const close = (): void => {
    if (isClosed) return;
    isClosed = true;
    
    // Flush remaining queue items synchronously before closing
    if (fd !== null) {
      try {
        for (const line of writeQueue) {
          try {
            fs.writeSync(fd, line);
          } catch {
            // Best effort flush - skip errors on individual lines
          }
        }
        fs.closeSync(fd);
      } catch {
        // Best effort close - fd may already be closed or invalid
      }
      fd = null;
    }
    writeQueue = [];
    isProcessing = false;
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
              // Log to stderr as last resort
              try {
                process.stderr.write(`[CapsKit Trace] Failed to write trace after ${MAX_RETRY_ATTEMPTS} retries\n`);
              } catch {
                // Absolute last resort - cannot do anything
              }
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

  const sink = (record: TraceRecord): void => {
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

  // Attach close method to the sink function
  (sink as ClosableTraceSink).close = close;
  return sink as ClosableTraceSink;
}

/**
 * Cached trace sink to avoid opening multiple file descriptors.
 */
let cachedSink: ClosableTraceSink | null = null;
let cachedSinkConfig: string | null = null;

/**
 * Get the current trace sink based on environment configuration.
 * Caches the sink to avoid opening multiple file descriptors.
 */
export function getTraceSink(): TraceSink | null {
  if (!isTraceEnabled()) {
    return null;
  }

  const traceFile = process.env.CAPSKIT_TRACE_FILE || null;

  // Reuse cached sink if config hasn't changed
  if (cachedSink && cachedSinkConfig === traceFile) {
    return cachedSink;
  }

  // Close previous sink if it exists
  if (cachedSink) {
    try {
      cachedSink.close();
    } catch {
      // Best effort close
    }
  }

  if (traceFile) {
    cachedSink = createAsyncFileSink(traceFile);
  } else {
    // Default to stdout - wrap in a closable sink (no-op close)
    const stdoutSink = (record: TraceRecord) => {
      try {
        process.stdout.write(JSON.stringify(record) + '\n');
      } catch {
        // Silently fail - tracing should not crash the action
      }
    };
    (stdoutSink as ClosableTraceSink).close = () => {};
    cachedSink = stdoutSink as ClosableTraceSink;
  }

  cachedSinkConfig = traceFile;
  return cachedSink;
}

/**
 * Close the cached trace sink and release resources (e.g., file descriptors).
 * Should be called during application shutdown.
 */
export function closeTraceSink(): void {
  if (cachedSink) {
    try {
      cachedSink.close();
    } catch {
      // Best effort close
    }
    cachedSink = null;
    cachedSinkConfig = null;
  }
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

    // redactPayload is imported at the top of this file

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
