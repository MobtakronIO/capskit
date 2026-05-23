import { CapInput, CapContext, CapHandler } from '../types/cap-input.type';
import { CapsuleHook } from '../types/capsule-definition.type';

export interface HookCap {
  name: string;
  handler: CapHandler;
}

/**
 * Checks if a capsule hook applies to the given cap name.
 * '*' or undefined means applies to all caps.
 */
function hookAppliesTo(hook: CapsuleHook, capName: string): boolean {
  if (!hook.caps) return true;
  if (hook.caps === '*') return true;
  if (Array.isArray(hook.caps)) return hook.caps.includes(capName);
  return hook.caps === capName;
}

/**
 * Resolves a hook name to a cap entry from allCaps.
 * Tries exact match first (full path like 'security.require-auth'),
 * then searches for a cap with matching short name (e.g., 'require-auth').
 */
function resolveHookCap(
  hookName: string,
  allCaps: Map<string, { meta: unknown; handler: CapHandler }>,
  capsuleName?: string,
): { name: string; handler: CapHandler } {
  // Try exact match first (full capPath)
  const exactMatch = allCaps.get(hookName);
  if (exactMatch) {
    return { name: hookName, handler: exactMatch.handler };
  }

  // Search for cap with matching short name
  // If capsuleName is provided, prefer caps from that capsule
  let bestMatch: { name: string; handler: CapHandler } | undefined;
  
  for (const [capPath, capEntry] of allCaps.entries()) {
    const parts = capPath.split('.');
    const shortName = parts[parts.length - 1];
    
    if (shortName === hookName) {
      // If we have a capsuleName and this cap is from that capsule, prefer it
      if (capsuleName && capPath.startsWith(`${capsuleName}.`)) {
        return { name: capPath, handler: capEntry.handler };
      }
      // Otherwise, keep the first match as fallback
      if (!bestMatch) {
        bestMatch = { name: capPath, handler: capEntry.handler };
      }
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  throw new Error(`Hook "${hookName}" not found`);
}

/**
 * Resolves hook names to actual handlers from loaded caps.
 * Merges capsule-level hooks (filtered by caps field) with cap-level hooks.
 * Capsule-level hooks run first, then cap-level hooks.
 */
export function resolveHooks(
  capHooks: string[] | { pre?: string[]; post?: string[] } | undefined,
  allCaps: Map<string, { meta: unknown; handler: CapHandler }>,
  capsuleHooks?: { pre?: CapsuleHook[]; post?: CapsuleHook[] },
  capName?: string,
  capsuleName?: string,
): { pre: HookCap[]; post: HookCap[] } {
  const pre: HookCap[] = [];
  const post: HookCap[] = [];

  // Step 1: Resolve capsule-level hooks (filtered by caps)
  if (capsuleHooks && capName) {
    if (capsuleHooks.pre) {
      for (const hook of capsuleHooks.pre) {
        if (hookAppliesTo(hook, capName)) {
          const hookCap = resolveHookCap(hook.name, allCaps, capsuleName);
          pre.push(hookCap);
        }
      }
    }
    if (capsuleHooks.post) {
      for (const hook of capsuleHooks.post) {
        if (hookAppliesTo(hook, capName)) {
          const hookCap = resolveHookCap(hook.name, allCaps, capsuleName);
          post.push(hookCap);
        }
      }
    }
  }

  // Step 2: Resolve cap-level hooks (merged after capsule-level)
  if (!capHooks) return { pre, post };

  if (Array.isArray(capHooks)) {
    // Backward compat: string[] treated as pre hooks
    for (const name of capHooks) {
      const hookCap = resolveHookCap(name, allCaps, capsuleName);
      pre.push(hookCap);
    }
    return { pre, post };
  }

  if (capHooks.pre) {
    for (const name of capHooks.pre) {
      const hookCap = resolveHookCap(name, allCaps, capsuleName);
      pre.push(hookCap);
    }
  }

  if (capHooks.post) {
    for (const name of capHooks.post) {
      const hookCap = resolveHookCap(name, allCaps, capsuleName);
      post.push(hookCap);
    }
  }

  return { pre, post };
}

/**
 * Chains pre hooks → handler → post hooks.
 *
 * Pre hooks run before the handler. They can:
 * - Throw to abort the pipeline
 * - Call ctx.next() to continue and run post logic after the handler
 * - Return without calling ctx.next() (validation-style) — pipeline auto-continues
 *
 * The handler always runs (unless a pre hook throws).
 *
 * Post hooks run after the handler. They receive ctx.result and ctx.next().
 */
export function buildHooksPipeline(
  preHooks: HookCap[],
  postHooks: HookCap[],
  handler: CapHandler,
): CapHandler {
  return async function chained(input: CapInput, ctx: CapContext): Promise<unknown> {
    // Run pre hooks sequentially, then handler
    const runPreAndHandler = async (): Promise<unknown> => {
      let preIdx = 0;

      const runNext = async (): Promise<unknown> => {
        // If there are more pre hooks, run the next one
        if (preIdx < preHooks.length) {
          const hook = preHooks[preIdx++];
          let nextCalled = false;
          const nextFn = async () => {
            nextCalled = true;
            return runNext();
          };
          const result = await hook.handler(input, { ...ctx, next: nextFn });
          // If hook didn't call ctx.next(), auto-continue to next pre hook or handler
          if (!nextCalled) {
            return runNext();
          }
          return result;
        }
        // No more pre hooks, run the handler
        return handler(input, ctx);
      };

      return runNext();
    };

    // Run post hooks sequentially after handler result
    const runPost = async (result: unknown): Promise<unknown> => {
      let postResult = result;
      let postIdx = 0;

      const runNextPost = async (): Promise<unknown> => {
        if (postIdx >= postHooks.length) {
          return postResult;
        }
        const hook = postHooks[postIdx++];
        let nextCalled = false;
        const nextFn = async () => {
          nextCalled = true;
          return runNextPost();
        };
        ctx.result = postResult;
        const hookResult = await hook.handler(input, { ...ctx, result: postResult, next: nextFn });
        // If hook didn't call ctx.next(), auto-continue to next post hook
        // but still apply any result transformation the hook returned
        if (!nextCalled) {
          if (hookResult !== undefined) {
            postResult = hookResult;
          }
          return runNextPost();
        }
        if (hookResult !== undefined) {
          postResult = hookResult;
        }
        return postResult;
      };

      return runNextPost();
    };

    const handlerResult = await runPreAndHandler();
    return runPost(handlerResult);
  };
}
