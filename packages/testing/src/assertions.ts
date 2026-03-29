import type { CapturedEvent } from './types';

/**
 * Deep equality check with better error messages for action results
 * 
 * @param result - The actual result from action execution
 * @param expected - The expected result
 * @param message - Optional custom message
 * 
 * @example
 * ```typescript
 * const harness = createTestCapsKit({ manifest: myManifest });
 * const { result } = await harness.capskit.call('myAction', { input: 'value' });
 * 
 * assertActionResult(result, { success: true, data: { id: 1 } });
 * ```
 */
export function assertActionResult(
  result: unknown,
  expected: unknown,
  message?: string
): void {
  const actualStr = JSON.stringify(result, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);
  
  if (!deepEqual(result, expected)) {
    const defaultMsg = `Action result mismatch:\n\nActual:\n${actualStr}\n\nExpected:\n${expectedStr}`;
    throw new Error(message ? `${message}\n\n${defaultMsg}` : defaultMsg);
  }
}

/**
 * Asserts that captured events match the expected pattern
 * 
 * @param events - The captured events
 * @param expected - Expected events (can include wildcards)
 * 
 * @example
 * ```typescript
 * const harness = createTestCapsKit({ manifest: myManifest });
 * await harness.capskit.call('createUser', { name: 'Alice' });
 * 
 * assertEvents(harness.events, [
 *   { name: 'user:created', data: { name: 'Alice' } },
 *   { name: 'email:sent', data: { template: 'welcome' } }
 * ]);
 * ```
 */
export function assertEvents(events: CapturedEvent[], expected: Array<{ name: string | ((name: string) => boolean); data?: unknown }>): void {
  if (events.length !== expected.length) {
    throw new Error(
      `Event count mismatch: expected ${expected.length} events, got ${events.length}\n\n` +
      `Captured events:\n${events.map(e => `  - ${e.name}: ${JSON.stringify(e.data)}`).join('\n')}`
    );
  }
  
  for (let i = 0; i < expected.length; i++) {
    const actual = events[i];
    const exp = expected[i];
    
    // Check name
    const nameMatches = typeof exp.name === 'function' 
      ? exp.name(actual.name) 
      : exp.name === actual.name;
    
    if (!nameMatches) {
      throw new Error(
        `Event ${i} name mismatch:\n` +
        `  Expected: ${typeof exp.name === 'function' ? '(matcher function)' : exp.name}\n` +
        `  Actual: ${actual.name}`
      );
    }
    
    // Check data if provided
    if (exp.data !== undefined && !deepEqual(actual.data, exp.data)) {
      throw new Error(
        `Event ${i} data mismatch for "${actual.name}":\n` +
        `  Expected: ${JSON.stringify(exp.data)}\n` +
        `  Actual: ${JSON.stringify(actual.data)}`
      );
    }
  }
}

/**
 * Asserts that there are no unhandled errors in the captured events
 * 
 * @param events - The captured events
 * 
 * @example
 * ```typescript
 * const harness = createTestCapsKit({ manifest: myManifest });
 * await harness.capskit.call('riskyAction', {});
 * 
 * assertNoUnhandledErrors(harness.events);
 * ```
 */
export function assertNoUnhandledErrors(events: CapturedEvent[]): void {
  const errorEvents = events.filter(e => 
    e.name === 'error' || 
    e.name === 'unhandled-error' ||
    e.name.endsWith(':error')
  );
  
  if (errorEvents.length > 0) {
    throw new Error(
      `Unhandled errors detected:\n${
        errorEvents.map(e => `  - ${e.name}: ${JSON.stringify(e.data)}`).join('\n')
      }`
    );
  }
}

/**
 * Asserts that specific events were emitted
 * 
 * @param events - The captured events
 * @param eventName - The event name to check
 * @param data - Optional data to match
 */
export function assertEventEmitted(
  events: CapturedEvent[],
  eventName: string,
  data?: unknown
): void {
  const found = events.some(e => {
    if (e.name !== eventName) return false;
    if (data !== undefined) {
      return deepEqual(e.data, data);
    }
    return true;
  });
  
  if (!found) {
    const dataStr = data !== undefined ? ` with data ${JSON.stringify(data)}` : '';
    throw new Error(
      `Expected event "${eventName}"${dataStr} was not emitted.\n\n` +
      `Captured events:\n${events.map(e => `  - ${e.name}: ${JSON.stringify(e.data)}`).join('\n')}`
    );
  }
}

/**
 * Asserts that specific events were NOT emitted
 * 
 * @param events - The captured events
 * @param eventName - The event name to check
 */
export function assertEventNotEmitted(
  events: CapturedEvent[],
  eventName: string
): void {
  const found = events.some(e => e.name === eventName);
  
  if (found) {
    throw new Error(
      `Expected event "${eventName}" was not expected but was emitted.\n\n` +
      `Emitted events:\n${events.map(e => `  - ${e.name}: ${JSON.stringify(e.data)}`).join('\n')}`
    );
  }
}

/**
 * Deep equality check for objects
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  
  if (a === null || b === null) return a === b;
  
  if (typeof a !== typeof b) return false;
  
  if (typeof a !== 'object') return a === b;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  
  if (Array.isArray(a) || Array.isArray(b)) return false;
  
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    
    const keysA = Object.keys(aObj);
    const keysB = Object.keys(bObj);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => 
      Object.prototype.hasOwnProperty.call(bObj, key) && 
      deepEqual(aObj[key], bObj[key])
    );
  }
  
  return false;
}
