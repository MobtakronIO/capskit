export function redactPayload(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return payload;
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization', 'key'];
  if (Array.isArray(payload)) {
    return payload.map(redactPayload);
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (sensitiveKeys.includes(k)) {
      result[k] = '[REDACTED]';
    } else {
      result[k] = redactPayload(v);
    }
  }
  return result;
}
