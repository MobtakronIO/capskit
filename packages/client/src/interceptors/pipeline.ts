import type { ClientInterceptor, InterceptorContext } from '../types/client.type';

export type CallExecutor = (
  actionPath: string,
  payload: unknown,
) => Promise<unknown>;

/**
 * Builds a pipeline that runs before/after interceptors around a call executor.
 *
 * Execution order:
 *   before[0] → before[1] → ... → executor → after[0] → after[1] → ...
 */
export async function buildInterceptorPipeline(
  interceptors: ClientInterceptor[],
  executor: CallExecutor,
  actionPath: string,
  payload: unknown,
): Promise<unknown> {
  let ctx: InterceptorContext = {
    actionPath,
    payload,
    metadata: {},
  };

  // Run all before hooks in order
  for (const interceptor of interceptors) {
    if (interceptor.before) {
      ctx = await interceptor.before(ctx);
      // If a before hook sets result, short-circuit
      if (ctx.result !== undefined) {
        return ctx.result;
      }
    }
  }

  // Execute the actual call
  const startTime = Date.now();
  try {
    const result = await executor(ctx.actionPath, ctx.payload);
    ctx.result = result;
    ctx.durationMs = Date.now() - startTime;
  } catch (err) {
    ctx.error = err;
    ctx.durationMs = Date.now() - startTime;

    // Run after hooks even on error so they can normalize/transform
    for (const interceptor of interceptors) {
      if (interceptor.after) {
        ctx = await interceptor.after(ctx);
      }
    }

    throw ctx.error;
  }

  // Run all after hooks in order
  for (const interceptor of interceptors) {
    if (interceptor.after) {
      ctx = await interceptor.after(ctx);
    }
  }

  return ctx.result;
}
