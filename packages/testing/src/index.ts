/**
 * @capskit/testing - Testing toolkit for capskit capsules and actions
 * 
 * Provides a minimal test harness that doesn't require booting the full runtime.
 * Framework-agnostic - works with any testing framework.
 * 
 * @example
 * ```typescript
 * import { createTestCapsKit, createMockDeps } from '@capskit/testing';
 * import { assertEvents, assertActionResult } from '@capskit/testing';
 * 
 * // Create mock deps factory
 * const { createMockDep } = createMockDeps();
 * 
 * // Create test harness
 * const harness = createTestCapsKit({
 *   manifest: myCapsuleManifest
 * });
 * 
 * // Add mock dependencies
 * harness.deps.db = createMockDep('db', {
 *   query: async (sql: string) => ({ rows: [{ id: 1, name: 'Alice' }] })
 * });
 * 
 * // Execute action
 * const { result, events } = await harness.capskit.call('myAction', { id: 1 });
 * 
 * // Assert results
 * assertActionResult(result, { success: true });
 * assertEvents(events, [
 *   { name: 'user:fetched' }
 * ]);
 * ```
 */

// Main test harness
export { createTestCapsKit, createTestAction } from './createTestCapsKit';

// Dependency mocking
export { createMockDeps, createMockFn } from './mockDeps';

// Event capture
export { captureEvents, EventCapture } from './captureEvents';

// Assertions
export {
  assertActionResult,
  assertEvents,
  assertNoUnhandledErrors,
  assertEventEmitted,
  assertEventNotEmitted
} from './assertions';

// Types (re-exported for convenience)
export type {
  TestCapsuleConfig,
  ActionResult,
  EmittedEvent,
  CapturedEvent,
  MockDepsOptions,
  MockDep,
  SpiedMethod,
  TestCapsKitHarness
} from './types';
