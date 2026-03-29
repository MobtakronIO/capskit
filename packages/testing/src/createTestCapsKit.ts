import type { CapsuleManifest, ActionHandler, ActionContext, ActionInput } from '@mobtakronio/capskit';
import { createMockDeps } from './mockDeps';
import { EventCapture } from './captureEvents';
import type { TestCapsKitHarness, ActionResult } from './types';

/**
 * Creates a minimal test harness for capskit capsules
 * 
 * This creates a lightweight test environment without booting the full runtime
 * (no HTTP servers, etc.). It provides:
 * - Mock dependency injection
 * - Event capture
 * - Action execution
 * 
 * @param config - Test capsule configuration
 * @returns A test harness with capskit-like interface and utilities
 * 
 * @example
 * ```typescript
 * const harness = createTestCapsKit({
 *   manifest: {
 *     name: 'test-capsule',
 *     actions: {
 *       getUser: {
 *         handler: async (input, ctx) => {
 *           const user = await ctx.deps.db.query('SELECT * FROM users WHERE id = ?', [input.body.id]);
 *           ctx.emit('user:fetched', { id: input.body.id });
 *           return user;
 *         }
 *       }
 *     }
 *   }
 * });
 * 
 * // Override deps with mocks
 * harness.deps.db = createMockDep('db', {
 *   query: async () => ({ id: 1, name: 'Alice' })
 * });
 * 
 * // Execute action
 * const { result, events } = await harness.capskit.call('test-capsule.getUser', { id: 1 });
 * 
 * // Assert results
 * expect(result).toEqual({ id: 1, name: 'Alice' });
 * expect(events).toContainEqual({ name: 'user:fetched', data: { id: 1 } });
 * ```
 */
export function createTestCapsKit(config: {
  manifest: CapsuleManifest | CapsuleManifest[];
  deps?: Record<string, unknown>;
}): TestCapsKitHarness {
  const manifests = Array.isArray(config.manifest) ? config.manifest : [config.manifest];
  const eventCapture = new EventCapture();
  
  // Create mock dependencies with spy support
  const mockDeps = createMockDeps({ spyOnMethods: true });
  const depsMap: Record<string, ReturnType<typeof mockDeps.createMockDep>> = {};
  
  // Initialize with provided deps
  for (const [name, value] of Object.entries(config.deps || {})) {
    depsMap[name] = mockDeps.createMockDep(name, value);
  }
  
  /**
   * Executes an action with the given payload
   */
  async function callAction(actionName: string, payload: unknown): Promise<ActionResult> {
    // Find the manifest and action
    let actionDef: { handler: ActionHandler; pre?: Array<(input: ActionInput, context: ActionContext) => Promise<void> | void>; post?: Array<(input: ActionInput, result: unknown, context: ActionContext) => Promise<unknown> | unknown> } | undefined;
    let manifest: CapsuleManifest | undefined;
    
    for (const m of manifests) {
      // If actionName contains '.', parse as capsule.action
      if (actionName.includes('.')) {
        const parts = actionName.split('.');
        const [capsuleName, actionKey] = parts;
        if (capsuleName === m.name && m.actions[actionKey]) {
          actionDef = m.actions[actionKey] as typeof actionDef;
          manifest = m;
          break;
        }
      } else {
        // Match by action name only across all capsules
        if (m.actions[actionName]) {
          actionDef = m.actions[actionName] as typeof actionDef;
          manifest = m;
          break;
        }
      }
    }
    
    if (!actionDef || !manifest) {
      throw new Error(`Action "${actionName}" not found in any manifest`);
    }
    
    // Normalize payload
    const isStructured = payload && typeof payload === 'object' &&
      ((payload as Record<string, unknown>).body !== undefined || 
       (payload as Record<string, unknown>).params !== undefined ||
       (payload as Record<string, unknown>).query !== undefined);
    
    const normalizedPayload = isStructured 
      ? payload as ActionInput
      : { body: payload, params: undefined, query: {} };
    
    // Build context with all deps and event capture
    const allDeps: Record<string, unknown> = {};
    for (const [name, mockDep] of Object.entries(depsMap)) {
      allDeps[name] = mockDep.value;
    }
    
    const context: ActionContext = {
      params: normalizedPayload.params,
      body: normalizedPayload.body,
      query: normalizedPayload.query || {},
      deps: allDeps,
      emit: (name: string, data: unknown) => eventCapture.emit(name, data),
      call: async (action: string, payload: unknown) => {
        const result = await callAction(action, payload);
        return result.result;
      },
      use: () => {
        throw new Error('use() is not available in test mode');
      }
    };
    
    // Execute pre-hooks
    if (actionDef.pre) {
      for (const hook of actionDef.pre) {
        await hook(normalizedPayload, context);
      }
    }
    
    // Execute handler
    let result = await actionDef.handler(normalizedPayload, context);
    
    // Execute post-hooks
    if (actionDef.post) {
      for (const hook of actionDef.post) {
        const hookResult = await hook(normalizedPayload, result, context);
        if (hookResult !== undefined) {
          result = hookResult;
        }
      }
    }
    
    return {
      result,
      events: eventCapture.getEvents()
    };
  }
  
  return {
    capskit: {
      call: callAction,
      getEvents: () => eventCapture.getEvents(),
      clearEvents: () => eventCapture.clear(),
      getManifests: () => manifests
    },
    deps: depsMap,
    events: eventCapture.events
  };
}

/**
 * Convenience function to create a test capsule with a single action
 * 
 * @param actionName - The action name
 * @param handler - The action handler function
 * @param capsuleName - Optional capsule name (default: 'test')
 * @returns A test harness
 * 
 * @example
 * ```typescript
 * const harness = createTestAction(
 *   'greet',
 *   async (input, ctx) => {
 *     return { message: `Hello, ${input.body.name}!` };
 *   }
 * );
 * 
 * const { result } = await harness.capskit.call('greet', { name: 'Alice' });
 * expect(result.message).toBe('Hello, Alice!');
 * ```
 */
export function createTestAction(
  actionName: string,
  handler: ActionHandler,
  capsuleName = 'test'
): TestCapsKitHarness {
  return createTestCapsKit({
    manifest: {
      name: capsuleName,
      actions: {
        [actionName]: { handler }
      }
    }
  });
}
