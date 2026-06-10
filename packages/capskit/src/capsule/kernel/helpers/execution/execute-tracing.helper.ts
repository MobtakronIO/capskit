import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { redactPayload } from '../redact-payload.helper';

export function isTraceEnabled(): boolean {
  return process.env.CAPSKIT_TRACE === '1';
}

export interface TraceInfo {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
}

export const traceStorage = new AsyncLocalStorage<TraceInfo>();

export function writeTrace(record: Record<string, unknown>): void {
  const line = JSON.stringify(record) + '\n';
  const traceFile = process.env.CAPSKIT_TRACE_FILE;
  if (traceFile) {
    try {
      fs.appendFileSync(traceFile, line);
    } catch {
      // Sink fallback: silently ignore file write failures so actions still succeed
    }
  } else {
    process.stdout.write(line);
  }
}

export async function withTracing<T>(actionName: string, payload: unknown, handler: () => Promise<T>): Promise<T> {
  if (!isTraceEnabled()) return handler();

  const parent = traceStorage.getStore();
  const traceId = parent?.traceId ?? randomUUID();
  const spanId = randomUUID();
  const parentSpanId = parent?.spanId ?? null;

  const timestampStart = Date.now();
  let status = 'ok';
  let output: unknown = null;
  let error: { message: string; code?: string } | null = null;

  try {
    const result = await traceStorage.run({ traceId, spanId, parentSpanId }, async () => {
      return await handler();
    });
    output = result;
    return result;
  } catch (err: unknown) {
    status = 'error';
    if (err instanceof Error) {
      error = { message: err.message, code: (err as any).code };
    } else {
      error = { message: String(err) };
    }
    throw err;
  } finally {
    const timestampEnd = Date.now();
    writeTrace({
      traceId,
      spanId,
      parentSpanId,
      action: actionName,
      status,
      durationMs: timestampEnd - timestampStart,
      timestampStart,
      timestampEnd,
      input: redactPayload(payload),
      output: status === 'ok' ? redactPayload(output) : null,
      error,
    });
  }
}
