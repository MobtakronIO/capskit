import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';

export const meta: CapMeta = {
  name: 'rpc',
  description: 'Unified RPC Endpoint for call and emit operations',
};

export default async function rpc(input: CapInput, ctx: CapContext) {
  const body = (input.body || {}) as Record<string, unknown>;
  const method = body.method as string | undefined;

  if (!method) {
    throw new Error('method is required (call or emit)');
  }

  const startTime = Date.now();

  switch (method) {
    case 'call': {
      const capPath = body.capPath as string | undefined;
      if (!capPath) {
        throw new Error('capPath is required for call');
      }
      const rawPayload = body.payload;
      const hasBody = rawPayload && typeof rawPayload === 'object' && 'body' in rawPayload;
      const normalizedPayload = hasBody
          ? (rawPayload as Record<string, unknown>)
          : { body: rawPayload, params: {}, query: {} };
      const result = await ctx.call(capPath, normalizedPayload);
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

    default:
      throw new Error(`Unknown RPC method: "${method}". Must be call or emit`);
  }
}
