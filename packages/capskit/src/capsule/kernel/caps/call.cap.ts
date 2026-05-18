import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';
import { buildHooksPipeline, resolveHooks } from '../helpers/build-hooks-pipeline.helper';

export const meta: CapMeta = {
  name: 'call',
  kind: 'action',
};

export default async function call(input: CapInput, ctx: CapContext) {
  const body = input.body || {};
  const capPath = body.capPath as string | undefined;
  const payload = body.payload;

  if (!capPath) {
    throw new Error('capPath is required');
  }

  const capEntry = ctx.deps.capsMap.get(capPath);
  if (!capEntry) {
    throw new Error(`Cap "${capPath}" not found`);
  }

  const capMeta = capEntry.meta;
  const capHookNames = capMeta.hooks || [];

  const capsuleDef = capEntry.capsuleDef;
  const capsuleHooks = capsuleDef?.hooks;

  const allCaps = ctx.deps.allCaps;

  const { pre, post } = resolveHooks(capHookNames, allCaps, capsuleHooks, capMeta.name);

  const handler = capEntry.handler;
  const pipeline = buildHooksPipeline(pre, post, handler);

  const capCtx: CapContext = {
    deps: ctx.deps,
    emit: ctx.emit,
    invoke: ctx.invoke,
    tell: ctx.tell,
    use: ctx.use,
  };

  const mergedInput: CapInput = {
    ...(payload as Record<string, unknown>),
  };

  const startTime = Date.now();
  try {
    const result = await pipeline(mergedInput, capCtx);
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
