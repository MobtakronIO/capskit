import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';

export const meta: CapMeta = {
  name: 'rpc',
  kind: 'action',
  description: 'Unified RPC Endpoint for call, emit, and tell operations',
};

export default async function rpc(input: CapInput, ctx: CapContext) {
  const body = (input.body || {}) as Record<string, unknown>;
  const method = body.method as string | undefined;

  if (!method) {
    throw new Error('method is required (call, emit, or tell)');
  }

  const startTime = Date.now();

  switch (method) {
    case 'call': {
      const capPath = body.capPath as string | undefined;
      if (!capPath) {
        throw new Error('capPath is required for call');
      }
      // Normalize payload to { body, params, query } format
      const rawPayload = body.payload;
      const hasBody = rawPayload && typeof rawPayload === 'object' && 'body' in rawPayload;
      const normalizedPayload = hasBody
          ? (rawPayload as Record<string, unknown>)
          : { body: rawPayload, params: {}, query: {} };
      const result = await ctx.invoke(capPath, normalizedPayload);
      return {
        ok: true,
        result,
        durationMs: Date.now() - startTime,
      };
    }

    case 'emit': {
      const event = body.event as string | undefined;
      if (!event) {
        throw new Error('event is required for emit');
      }
      ctx.emit(event, body.data);
      return {
        ok: true,
        result: { emitted: true, event },
        durationMs: Date.now() - startTime,
      };
    }

    case 'tell': {
      const capPath = body.capPath as string | undefined;
      if (!capPath) {
        throw new Error('capPath is required for tell');
      }
      ctx.tell(capPath, body.payload);
      return {
        ok: true,
        result: { told: true, capPath },
        durationMs: Date.now() - startTime,
      };
    }

    default:
      throw new Error(`Unknown RPC method: "${method}". Must be call, emit, or tell`);
  }
}
