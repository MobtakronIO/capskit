import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';
import { executeCap } from '../helpers/execute-cap.helper';

export const meta: CapMeta = {
  name: 'call',
};

export default async function call(input: CapInput, ctx: CapContext) {
  const body = input.body || {};
  const capPath = body.capPath as string | undefined;
  const payload = body.payload;

  if (!capPath) {
    throw new Error('capPath is required');
  }

  const startTime = Date.now();
  try {
    const result = await executeCap(capPath, payload, ctx);
    return {
      ok: true,
      result,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    };
  }
}
