# @capskit/testing

Testing toolkit for capskit capsules and actions.

## Overview

A minimal, framework-agnostic testing toolkit that allows you to test capskit capsules and actions without booting the full runtime (no HTTP servers, etc.).

## Installation

```bash
npm install @capskit/testing
# or
yarn add @capskit/testing
# or
pnpm add @capskit/testing
```

## Core API

### `createTestCapsKit(config)`

Creates a test harness for testing capsule manifests.

```typescript
import { createTestCapsKit } from '@capskit/testing';
import type { CapsuleManifest } from '@mobtakronio/capskit';

const harness = createTestCapsKit({
  manifest: {
    name: 'my-capsule',
    actions: {
      getUser: {
        handler: async (input, ctx) => {
          const user = await ctx.deps.db.query('SELECT * FROM users WHERE id = ?', [input.body.id]);
          ctx.emit('user:fetched', { id: input.body.id });
          return user;
        }
      }
    }
  }
});
```

### `createTestAction(name, handler, capsuleName?)`

Convenience function for testing a single action.

```typescript
import { createTestAction } from '@capskit/testing';

const harness = createTestAction(
  'greet',
  async (input) => ({ message: `Hello, ${input.body.name}!` })
);
```

## Mock Dependencies

### `createMockDeps(options?)`

Factory for creating mock dependencies with optional spy support.

```typescript
import { createMockDeps } from '@capskit/testing';

const { createMockDep, spyOnDep, createMockDepsFromObject } = createMockDeps({ spyOnMethods: true });

// Create a single mock dep
const db = createMockDep('db', {
  query: async (sql, params) => ({ rows: [{ id: 1, name: 'Alice' }] }),
  insert: async (table, data) => ({ id: 123 })
});

// Spy on a method
const querySpy = spyOnDep(db, 'query');
await db.value.query('SELECT 1');

console.log(querySpy.called);      // true
console.log(querySpy.callCount);   // 1
console.log(querySpy.lastCall);   // ['SELECT 1']
```

## Event Capture

### `captureEvents()`

Creates an event capture array and emit function.

```typescript
import { captureEvents } from '@capskit/testing';

const { events, emit } = captureEvents();

emit('user:created', { id: 1, name: 'Alice' });
emit('user:updated', { id: 1, name: 'Bob' });

console.log(events);
// [
//   { name: 'user:created', data: { id: 1, name: 'Alice' }, timestamp: 1234567890 },
//   { name: 'user:updated', data: { id: 1, name: 'Bob' }, timestamp: 1234567891 }
// ]
```

### `EventCapture` class

A class-based event capture with pattern matching and utilities.

```typescript
import { EventCapture } from '@capskit/testing';

const capture = new EventCapture();

capture.emit('user:created', { id: 1 });
capture.emit('order:created', { id: 100 });

// Filter by pattern
const userEvents = capture.getEventsByPattern('user:*');
console.log(userEvents.length); // 1

// Check if event exists
console.log(capture.hasEvent('user:created')); // true

// Clear events
capture.clear();
```

## Assertions

### `assertActionResult(result, expected, message?)`

Deep equality check with better error messages.

```typescript
import { assertActionResult } from '@capskit/testing';

const { result } = await harness.capskit.call('getUser', { id: 1 });

assertActionResult(result, { id: 1, name: 'Alice' });
// Throws with helpful diff if mismatch
```

### `assertEvents(events, expected)`

Assert captured events match expected pattern.

```typescript
import { assertEvents } from '@capskit/testing';

const { events } = await harness.capskit.call('createUser', { name: 'Alice' });

assertEvents(events, [
  { name: 'user:created', data: { id: 1, name: 'Alice' } },
  { name: 'email:sent', data: { template: 'welcome' } }
]);
```

### `assertNoUnhandledErrors(events)`

Assert no error events were emitted.

### `assertEventEmitted(events, name, data?)`

Assert a specific event was emitted.

### `assertEventNotEmitted(events, name)`

Assert a specific event was NOT emitted.

## Complete Example

```typescript
import { describe, it, expect } from 'bun:test';
import { createTestCapsKit } from '@capskit/testing';
import { createMockDeps, assertEvents, assertActionResult } from '@capskit/testing';

describe('User Capsule', () => {
  it('should create a user and emit events', async () => {
    // Setup mock deps
    const { createMockDep, spyOnDep } = createMockDeps();
    const mockDb = createMockDep('db', {
      query: async () => ({ rows: [] }),
      insert: async (_, data) => ({ id: 123, ...data as object })
    });

    // Create harness
    const harness = createTestCapsKit({
      manifest: {
        name: 'users',
        actions: {
          create: {
            handler: async (input, ctx) => {
              const result = await ctx.deps.db.insert('users', input.body);
              ctx.emit('user:created', { id: result.id, ...input.body });
              return result;
            }
          }
        }
      }
    });

    // Inject mock deps
    harness.deps.db = mockDb;

    // Execute
    const { result, events } = await harness.capskit.call('create', {
      body: { name: 'Alice', email: 'alice@example.com' }
    });

    // Assert
    assertActionResult(result, { id: 123, name: 'Alice', email: 'alice@example.com' });
    assertEvents(events, [
      { name: 'user:created', data: { id: 123, name: 'Alice', email: 'alice@example.com' } }
    ]);
  });
});
```

## API Reference

### Types

```typescript
// Test harness returned by createTestCapsKit
interface TestCapsKitHarness {
  capskit: {
    call(actionName: string, payload: unknown): Promise<ActionResult>;
    getEvents(): CapturedEvent[];
    clearEvents(): void;
    getManifests(): CapsuleManifest[];
  };
  deps: Record<string, MockDep>;
  events: CapturedEvent[];
}

interface ActionResult {
  result: unknown;
  events: EmittedEvent[];
}

interface CapturedEvent {
  name: string;
  data: unknown;
  timestamp?: number;
}

interface MockDep {
  value: unknown;
  isSpy: boolean;
}

interface SpiedMethod {
  name: string;
  called: boolean;
  callCount: number;
  lastCall: unknown[] | undefined;
  calls: unknown[][];
  value: (...args: unknown[]) => Promise<unknown>;
}
```

## License

MIT
