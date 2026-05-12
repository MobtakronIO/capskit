/**
 * Invoke/Tell Proxy Handlers for CapsKit Context
 *
 * Implements the ctx.invoke and ctx.tell messaging model using
 * JavaScript Proxy objects. The proxies intercept property access
 * to build fully-qualified action names dynamically.
 *
 * ## Usage
 *
 * ```typescript
 * // Inside an action handler:
 * const result = await ctx.invoke.serviceName.actionName({ body: { ... } });
 *
 * // Fire-and-forget:
 * ctx.tell.analytics.track({ body: { event: 'page.viewed' } });
 * ```
 *
 * Both proxies integrate with the kernel's tracing system,
 * wrapping every dispatched call with trace spans.
 */

import { ActionInput } from '../types';

/**
 * Signature for the kernel's call function.
 * Matches CapsKit.call(actionName, payload, opts?).
 */
export type KernelCallFn = (actionName: string, payload: any, opts?: { fromUse?: boolean }) => Promise<any>;

/**
 * A callable proxy that represents an action at the end of the chain.
 * When invoked, it builds the action name and dispatches to the kernel.
 */
type ActionCaller = (payload: any) => Promise<any>;

/**
 * A proxy for a service (first-level property after invoke/tell).
 * Accessing a property on this returns an ActionCaller.
 */
type ServiceProxy = { [actionName: string]: ActionCaller };

/**
 * The top-level invoke proxy type.
 * Supports accessing any service name as a property.
 */
export type InvokeProxy = { [serviceName: string]: ServiceProxy };

/**
 * The top-level tell proxy type (fire-and-forget).
 */
export type TellProxy = { [serviceName: string]: { [actionName: string]: (payload: any) => void } };

/**
 * Creates the ctx.invoke proxy.
 *
 * When a service name is accessed (e.g., `ctx.invoke.users`),
 * a second proxy is returned. When an action name is accessed
 * on that second proxy and immediately called (e.g., `.create(input)`),
 * the full action name `users.create` is built, looked up in the
 * kernel's action registry, and executed.
 *
 * The call is wrapped with the tracing system so every invoke
 * creates a properly-nested trace span.
 *
 * @param callFn - The kernel's call function to dispatch actions
 * @returns A proxy implementing the invoke messaging pattern
 */
export function createInvokeProxy(callFn: KernelCallFn): InvokeProxy {
  return new Proxy({}, {
    get: (_target, serviceName: string | symbol) => {
      if (typeof serviceName !== 'string') {
        return undefined;
      }

      // Return a second proxy for the action name level
      return new Proxy({}, {
        get: (_actionTarget, actionName: string | symbol) => {
          if (typeof actionName !== 'string') {
            return undefined;
          }

          // Return an async function that dispatches the action
          return async (payload: any): Promise<any> => {
            const fullActionName = `${serviceName}.${actionName}`;

            // Normalize payload: support both structured (body/params/query)
            // and plain values (which become the body)
            const normalizedPayload: ActionInput = payload && typeof payload === 'object' && !Array.isArray(payload)
              ? {
                  body: payload.body !== undefined ? payload.body : payload,
                  params: payload.params,
                  query: payload.query ?? {},
                }
              : { body: payload, query: {} };

            // Delegate to the kernel's call function which handles:
            // - Action lookup
            // - Input/output validation
            // - Interceptor pipeline (pre/post hooks, cache, resiliency)
            // - Circuit breaker
            // - Tracing (via traceCall wrapper)
            return callFn(fullActionName, normalizedPayload, { fromUse: true });
          };
        },
      }) as ServiceProxy;
    },
  }) as InvokeProxy;
}

/**
 * Creates the ctx.tell proxy (fire-and-forget).
 *
 * Works identically to invoke in terms of property access,
 * but the returned function dispatches the action without
 * waiting for the result. The call is executed asynchronously
 * and any errors are logged but not thrown to the caller.
 *
 * For tracing, tell messages create a detached trace span
 * (using the current trace context as parent for correlation).
 *
 * @param callFn - The kernel's call function to dispatch actions
 * @returns A proxy implementing the tell messaging pattern
 */
export function createTellProxy(callFn: KernelCallFn): TellProxy {
  return new Proxy({}, {
    get: (_target, serviceName: string | symbol) => {
      if (typeof serviceName !== 'string') {
        return undefined;
      }

      // Return a second proxy for the action name level
      return new Proxy({}, {
        get: (_actionTarget, actionName: string | symbol) => {
          if (typeof actionName !== 'string') {
            return undefined;
          }

          // Return a void function that dispatches fire-and-forget
          return (payload: any): void => {
            const fullActionName = `${serviceName}.${actionName}`;

            // Normalize payload
            const normalizedPayload: ActionInput = payload && typeof payload === 'object' && !Array.isArray(payload)
              ? {
                  body: payload.body !== undefined ? payload.body : payload,
                  params: payload.params,
                  query: payload.query ?? {},
                }
              : { body: payload, query: {} };

            // Fire-and-forget: dispatch asynchronously without awaiting.
            // Errors are caught and logged to prevent unhandled rejections.
            callFn(fullActionName, normalizedPayload, { fromUse: true }).catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              // Use a simple console.error for now; the kernel logger could be used
              // but that would create a circular dependency. The kernel handles
              // error logging internally; this catch prevents unhandled rejections.
              console.error(
                `[CapsKit] Unhandled error in tell dispatch to "${fullActionName}": ${message}`
              );
            });
          };
        },
      }) as { [actionName: string]: (payload: any) => void };
    },
  }) as TellProxy;
}
