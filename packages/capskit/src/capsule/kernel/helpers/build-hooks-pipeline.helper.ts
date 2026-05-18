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
 * Resolves hook names to actual handlers from loaded caps.
 * Merges capsule-level hooks (filtered by caps field) with cap-level hooks.
 * Capsule-level hooks run first, then cap-level hooks.
 */
export function resolveHooks(
  capHooks: string[] | { pre?: string[]; post?: string[] } | undefined,
  allCaps: Map<string, { meta: unknown; handler: CapHandler }>,
  capsuleHooks?: { pre?: CapsuleHook[]; post?: CapsuleHook[] },
  capName?: string,
): { pre: HookCap[]; post: HookCap[] } {
  const pre: HookCap[] = [];
  const post: HookCap[] = [];

  // Step 1: Resolve capsule-level hooks (filtered by caps)
  if (capsuleHooks && capName) {
    if (capsuleHooks.pre) {
      for (const hook of capsuleHooks.pre) {
        if (hookAppliesTo(hook, capName)) {
          const cap = allCaps.get(hook.name);
          if (!cap) throw new Error(`Hook "${hook.name}" not found`);
          pre.push({ name: hook.name, handler: cap.handler });
        }
      }
    }
    if (capsuleHooks.post) {
      for (const hook of capsuleHooks.post) {
        if (hookAppliesTo(hook, capName)) {
          const cap = allCaps.get(hook.name);
          if (!cap) throw new Error(`Hook "${hook.name}" not found`);
          post.push({ name: hook.name, handler: cap.handler });
        }
      }
    }
  }

  // Step 2: Resolve cap-level hooks (merged after capsule-level)
  if (!capHooks) return { pre, post };

  if (Array.isArray(capHooks)) {
    // Backward compat: string[] treated as pre hooks
    for (const name of capHooks) {
      const cap = allCaps.get(name);
      if (!cap) throw new Error(`Hook "${name}" not found`);
      pre.push({ name, handler: cap.handler });
    }
    return { pre, post };
  }

  if (capHooks.pre) {
    for (const name of capHooks.pre) {
      const cap = allCaps.get(name);
      if (!cap) throw new Error(`Hook "${name}" not found`);
      pre.push({ name, handler: cap.handler });
    }
  }

  if (capHooks.post) {
    for (const name of capHooks.post) {
      const cap = allCaps.get(name);
      if (!cap) throw new Error(`Hook "${name}" not found`);
      post.push({ name, handler: cap.handler });
    }
  }

  return { pre, post };
}

/**
 * Chains pre hooks → handler → post hooks.
 * Pre hooks run before handler, can throw to stop execution.
 * Post hooks run after handler, receive ctx.result, can transform.
 * Hooks that call ctx.next() can run both pre and post logic.
 */
export function buildHooksPipeline(
  preHooks: HookCap[],
  postHooks: HookCap[],
  handler: CapHandler,
): CapHandler {
  return async function chained(input: CapInput, ctx: CapContext): Promise<unknown> {
    let preIdx = 0;

    const runPre = async (): Promise<unknown> => {
      if (preIdx >= preHooks.length) {
        return handler(input, ctx);
      }
      const hook = preHooks[preIdx++];
      return hook.handler(input, { ...ctx, next: runPre });
    };

    const runPost = async (result: unknown): Promise<unknown> => {
      let postResult = result;
      for (const hook of postHooks) {
        ctx.result = postResult;
        const hookResult = await hook.handler(input, { ...ctx, result: postResult });
        if (hookResult !== undefined) {
          postResult = hookResult;
        }
      }
      return postResult;
    };

    const preResult = await runPre();
    return runPost(preResult);
  };
}
