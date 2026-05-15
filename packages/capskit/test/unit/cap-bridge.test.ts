/**
 * Cap-to-Manifest Bridge Unit Tests
 *
 * Comprehensive unit tests for the cap-to-manifest conversion bridge:
 * - Single cap conversion (convertCapToManifest)
 * - Multiple caps conversion (convertCapsToManifests)
 * - Empty routes/events handling
 * - Duplicate dependency deduplication
 * - Action name collision detection
 * - Manifest shape validation pass-through
 * - CapContext adapter (createCapContext & wrapCapHandler)
 * - Registry manifest merge specifics
 *
 * All tests are fast, synchronous, and independent.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import {
  convertCapToManifest,
  convertCapsToManifests,
  convertRegistryToManifest,
  convertRegistriesToManifests,
  createCapContext,
  wrapCapHandler,
  CapLoadError,
} from '../../src/kernel/cap-loader';
import type {
  CapDefinition,
  CapsuleRegistry,
  CapsuleManifest,
  ActionContext,
  ActionInput,
  CapContext,
} from '../../src/types';

// ===========================================================================
// 1. SINGLE CAP CONVERSION (convertCapToManifest)
// ===========================================================================

describe('Single Cap Conversion', () => {
  test('creates manifest with correct name from cap meta', () => {
    class TestCap {
      async doWork(input: any, ctx: any) { return { ok: true }; }
    }
    const def: CapDefinition = { class: TestCap, meta: { name: 'worker' } };
    const manifest = convertCapToManifest(def);
    expect(manifest.name).toBe('worker');
  });

  test('uses custom capsuleName override when provided', () => {
    class TestCap {
      async doWork(input: any, ctx: any) { return { ok: true }; }
    }
    const def: CapDefinition = { class: TestCap, meta: { name: 'original' } };
    const manifest = convertCapToManifest(def, 'custom-name');
    expect(manifest.name).toBe('custom-name');
  });

  test('maps all public class methods as actions', () => {
    class MultiMethodCap {
      async create(input: any, ctx: any) { return { id: 1 }; }
      async update(input: any, ctx: any) { return { id: 1 }; }
      async delete(input: any, ctx: any) { return { ok: true }; }
      async list(input: any, ctx: any) { return []; }
    }
    const def: CapDefinition = { class: MultiMethodCap, meta: { name: 'crud' } };
    const manifest = convertCapToManifest(def);
    expect(Object.keys(manifest.actions)).toHaveLength(4);
    expect(manifest.actions.create).toBeDefined();
    expect(manifest.actions.update).toBeDefined();
    expect(manifest.actions.delete).toBeDefined();
    expect(manifest.actions.list).toBeDefined();
  });

  test('action handlers are functions (not strings)', () => {
    class TestCap {
      async action(input: any, ctx: any) { return { ok: true }; }
    }
    const def: CapDefinition = { class: TestCap, meta: { name: 'test' } };
    const manifest = convertCapToManifest(def);
    expect(typeof manifest.actions.action.handler).toBe('function');
  });

  test('action description includes cap name', () => {
    class TestCap {
      async action(input: any, ctx: any) { return {}; }
    }
    const def: CapDefinition = { class: TestCap, meta: { name: 'my-cap' } };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.action.description).toBe('Cap "my-cap" action: action');
  });

  test('action handlers are bound to the class instance', async () => {
    class StatefulCap {
      private value = 42;
      async getValue(input: any, ctx: any) { return { value: this.value }; }
    }
    const def: CapDefinition = { class: StatefulCap, meta: { name: 'stateful' } };
    const manifest = convertCapToManifest(def);
    const handler = manifest.actions.getValue.handler as Function;
    const result = await handler({ body: {} }, {} as any);
    expect(result).toEqual({ value: 42 });
  });

  test('throws CapLoadError when cap has no action methods', () => {
    class EmptyCap {
      constructor() { /* nothing */ }
    }
    const def: CapDefinition = { class: EmptyCap as any, meta: { name: 'empty' } };
    expect(() => convertCapToManifest(def)).toThrow(CapLoadError);
  });

  test('method that is not async is still mapped as action', () => {
    class SyncCap {
      syncMethod(input: any, ctx: any) { return { ok: true }; }
    }
    const def: CapDefinition = { class: SyncCap, meta: { name: 'sync' } };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.syncMethod).toBeDefined();
    expect(typeof manifest.actions.syncMethod.handler).toBe('function');
  });
});

// ===========================================================================
// 2. MULTIPLE CAPS CONVERSION (convertCapsToManifests)
// ===========================================================================

describe('Multiple Caps Conversion', () => {
  test('converts an array of caps into an array of manifests', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const defs: CapDefinition[] = [
      { class: CapA, meta: { name: 'alpha' } },
      { class: CapB, meta: { name: 'beta' } },
    ];
    const manifests = convertCapsToManifests(defs);
    expect(manifests).toHaveLength(2);
    expect(manifests[0].name).toBe('alpha');
    expect(manifests[1].name).toBe('beta');
  });

  test('each manifest has independent actions', () => {
    class CapA { async actionA(input: any, ctx: any) { return {}; } }
    class CapB { async actionB(input: any, ctx: any) { return {}; } }
    const defs: CapDefinition[] = [
      { class: CapA, meta: { name: 'a' } },
      { class: CapB, meta: { name: 'b' } },
    ];
    const manifests = convertCapsToManifests(defs);
    expect(manifests[0].actions.actionA).toBeDefined();
    expect(manifests[1].actions.actionB).toBeDefined();
    expect(Object.keys(manifests[0].actions)).toHaveLength(1);
  });

  test('each manifest preserves its own dependencies', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const defs: CapDefinition[] = [
      { class: CapA, meta: { name: 'a', dependencies: ['db'] } },
      { class: CapB, meta: { name: 'b', dependencies: ['redis', 'queue'] } },
    ];
    const manifests = convertCapsToManifests(defs);
    expect(manifests[0].requires).toEqual(['db']);
    expect(manifests[1].requires).toEqual(['redis', 'queue']);
  });

  test('returns empty array for empty input', () => {
    const manifests = convertCapsToManifests([]);
    expect(manifests).toHaveLength(0);
  });
});

// ===========================================================================
// 3. EMPTY ROUTES / EVENTS HANDLING
// ===========================================================================

describe('Empty Routes / Events Handling', () => {
  test('manifest omits requires when no dependencies defined', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = { class: TestCap, meta: { name: 'test' } };
    const manifest = convertCapToManifest(def);
    expect(manifest.requires).toBeUndefined();
  });

  test('manifest omits events when none defined', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = { class: TestCap, meta: { name: 'test' } };
    const manifest = convertCapToManifest(def);
    expect(manifest.events).toBeUndefined();
  });

  test('manifest omits routes when none defined', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = { class: TestCap, meta: { name: 'test' } };
    const manifest = convertCapToManifest(def);
    expect((manifest as any).routes).toBeUndefined();
  });

  test('manifest omits events when only publishes is empty array', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = {
      class: TestCap,
      meta: { name: 'test', events: { publishes: [] } },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.events).toBeDefined();
    expect(manifest.events!.publishes).toEqual([]);
  });

  test('manifest includes events when only publishes is defined', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = {
      class: TestCap,
      meta: { name: 'test', events: { publishes: ['test.done'] } },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.events).toBeDefined();
    expect(manifest.events!.publishes).toEqual(['test.done']);
    expect(manifest.events!.subscribes).toBeUndefined();
  });

  test('manifest includes events when only subscribes is defined', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'test',
        events: { subscribes: [{ event: 'user.created', action: 'action' }] },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.events).toBeDefined();
    expect(manifest.events!.subscribes).toEqual([
      { event: 'user.created', action: 'action' },
    ]);
    expect(manifest.events!.publishes).toBeUndefined();
  });

  test('manifest includes both publishes and subscribes', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'test',
        events: {
          publishes: ['test.started'],
          subscribes: [{ event: 'init', action: 'action' }],
        },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.events).toBeDefined();
    expect(manifest.events!.publishes).toEqual(['test.started']);
    expect(manifest.events!.subscribes).toEqual([
      { event: 'init', action: 'action' },
    ]);
  });

  test('routes stored as extra manifest property when defined', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'test',
        routes: [
          { method: 'GET', path: '/items', action: 'action' },
          { method: 'POST', path: '/items', action: 'action' },
        ],
      },
    };
    const manifest = convertCapToManifest(def);
    const routes = (manifest as any).routes;
    expect(routes).toBeDefined();
    expect(routes).toHaveLength(2);
    expect(routes[0].method).toBe('GET');
    expect(routes[1].method).toBe('POST');
  });

  test('registry manifest omits routes when no caps have routes', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'no-routes',
      caps: [
        { class: CapA, meta: { name: 'a' } },
        { class: CapB, meta: { name: 'b' } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect((manifest as any).routes).toBeUndefined();
  });

  test('registry manifest omits events when no caps have events', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'no-events',
      caps: [
        { class: CapA, meta: { name: 'a' } },
        { class: CapB, meta: { name: 'b' } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.events).toBeUndefined();
  });

  test('registry manifest omits requires when no caps have dependencies', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'no-deps',
      caps: [
        { class: CapA, meta: { name: 'a' } },
        { class: CapB, meta: { name: 'b' } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.requires).toBeUndefined();
  });
});

// ===========================================================================
// 4. DUPLICATE DEPENDENCY DEDUPLICATION
// ===========================================================================

describe('Duplicate Dependency Deduplication', () => {
  test('registry manifest deduplicates dependencies from multiple caps', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    class CapC { async c(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'dedup-deps',
      caps: [
        { class: CapA, meta: { name: 'a', dependencies: ['db', 'redis', 'queue'] } },
        { class: CapB, meta: { name: 'b', dependencies: ['redis', 'logger'] } },
        { class: CapC, meta: { name: 'c', dependencies: ['db', 'cache'] } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.requires).toBeDefined();
    const sorted = [...manifest.requires!].sort();
    // Union of all deps: db, redis, queue, logger, cache
    expect(sorted).toEqual(['cache', 'db', 'logger', 'queue', 'redis']);
    expect(sorted).toHaveLength(5);
  });

  test('registry manifest handles caps with no dependencies in union', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'partial-deps',
      caps: [
        { class: CapA, meta: { name: 'a', dependencies: ['db'] } },
        { class: CapB, meta: { name: 'b' } }, // no dependencies
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.requires).toEqual(['db']);
  });

  test('registry manifest deduplicates event publishes from multiple caps', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'dedup-events',
      caps: [
        {
          class: CapA,
          meta: {
            name: 'a',
            events: { publishes: ['user.created', 'user.updated', 'shared.event'] },
          },
        },
        {
          class: CapB,
          meta: {
            name: 'b',
            events: { publishes: ['user.deleted', 'shared.event', 'shared.event'] },
          },
        },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.events?.publishes).toBeDefined();
    const pubs = manifest.events!.publishes!;
    // unique: user.created, user.updated, shared.event, user.deleted
    expect(pubs).toHaveLength(4);
    expect(pubs).toContain('user.created');
    expect(pubs).toContain('user.updated');
    expect(pubs).toContain('user.deleted');
    expect(pubs).toContain('shared.event');
    // shared.event should appear only once
    expect(pubs.filter((p: string) => p === 'shared.event')).toHaveLength(1);
  });

  test('registry manifest preserves all event subscriptions (no dedup)', () => {
    class CapA { async handleCreate(input: any, ctx: any) { return {}; } }
    class CapB { async handleLog(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'subs',
      caps: [
        {
          class: CapA,
          meta: {
            name: 'a',
            events: {
              subscribes: [
                { event: 'user.created', action: 'handleCreate' },
                { event: 'user.created', action: 'handleCreate' }, // duplicate subscription
              ],
            },
          },
        },
        {
          class: CapB,
          meta: {
            name: 'b',
            events: {
              subscribes: [{ event: 'user.created', action: 'handleLog' }],
            },
          },
        },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.events?.subscribes).toBeDefined();
    // Subscribes are concatenated, not deduplicated
    expect(manifest.events!.subscribes!).toHaveLength(3);
  });
});

// ===========================================================================
// 5. ACTION NAME COLLISION DETECTION
// ===========================================================================

describe('Action Name Collision Detection', () => {
  test('convertRegistryToManifest emits warning for duplicate action names', () => {
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((msg: string) => warnings.push(msg));

    try {
      class CapA { async shared(input: any, ctx: any) { return { from: 'a' }; } }
      class CapB { async shared(input: any, ctx: any) { return { from: 'b' }; } }
      const registry: CapsuleRegistry = {
        name: 'collision-test',
        caps: [
          { class: CapA, meta: { name: 'a' } },
          { class: CapB, meta: { name: 'b' } },
        ],
      };
      const manifest = convertRegistryToManifest(registry);

      expect(warnings.some((w) => w.includes('shared'))).toBe(true);
      expect(warnings.some((w) => w.includes('collision-test'))).toBe(true);
      expect(manifest.actions.shared).toBeDefined();
    } finally {
      vi.restoreAllMocks();
    }
  });

  test('last definition wins on duplicate action names', async () => {
    class CapA {
      async shared(input: any, ctx: any) { return { source: 'cap-a' }; }
    }
    class CapB {
      async shared(input: any, ctx: any) { return { source: 'cap-b' }; }
    }
    const registry: CapsuleRegistry = {
      name: 'last-wins',
      caps: [
        { class: CapA, meta: { name: 'a' } },
        { class: CapB, meta: { name: 'b' } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    const handler = manifest.actions.shared.handler as Function;
    const result = await handler({ body: {} }, {} as any);
    expect(result).toEqual({ source: 'cap-b' });
  });

  test('first cap wins when no collision', async () => {
    class CapA {
      async uniqueA(input: any, ctx: any) { return { source: 'a' }; }
    }
    class CapB {
      async uniqueB(input: any, ctx: any) { return { source: 'b' }; }
    }
    const registry: CapsuleRegistry = {
      name: 'no-collision',
      caps: [
        { class: CapA, meta: { name: 'a' } },
        { class: CapB, meta: { name: 'b' } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    const resultA = await (manifest.actions.uniqueA.handler as Function)({ body: {} }, {} as any);
    const resultB = await (manifest.actions.uniqueB.handler as Function)({ body: {} }, {} as any);
    expect(resultA).toEqual({ source: 'a' });
    expect(resultB).toEqual({ source: 'b' });
  });

  test('no warning when action names are distinct', () => {
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((msg: string) => warnings.push(msg));

    try {
      class CapA { async actionA(input: any, ctx: any) { return {}; } }
      class CapB { async actionB(input: any, ctx: any) { return {}; } }
      const registry: CapsuleRegistry = {
        name: 'distinct',
        caps: [
          { class: CapA, meta: { name: 'a' } },
          { class: CapB, meta: { name: 'b' } },
        ],
      };
      convertRegistryToManifest(registry);
      const collisionWarnings = warnings.filter((w) =>
        w.includes('defined in multiple caps'),
      );
      expect(collisionWarnings).toHaveLength(0);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test('warning emitted for each duplicate action name', () => {
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((msg: string) => warnings.push(msg));

    try {
      class CapA {
        async dup1(input: any, ctx: any) { return {}; }
        async dup2(input: any, ctx: any) { return {}; }
      }
      class CapB {
        async dup1(input: any, ctx: any) { return {}; }
        async dup2(input: any, ctx: any) { return {}; }
      }
      const registry: CapsuleRegistry = {
        name: 'multi-collision',
        caps: [
          { class: CapA, meta: { name: 'a' } },
          { class: CapB, meta: { name: 'b' } },
        ],
      };
      convertRegistryToManifest(registry);

      const collisionWarnings = warnings.filter((w) =>
        w.includes('defined in multiple caps'),
      );
      expect(collisionWarnings).toHaveLength(2);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ===========================================================================
// 6. MANIFEST SHAPE VALIDATION PASS-THROUGH
// ===========================================================================

describe('Manifest Shape Validation Pass-Through', () => {
  test('manifest has required top-level fields', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = { class: TestCap, meta: { name: 'test' } };
    const manifest = convertCapToManifest(def);

    expect(typeof manifest.name).toBe('string');
    expect(typeof manifest.actions).toBe('object');
    expect(manifest.actions).not.toBeNull();
    expect(Array.isArray(manifest.actions)).toBe(false);
  });

  test('manifest actions record has correct shape', () => {
    class TestCap { async doWork(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = { class: TestCap, meta: { name: 'test' } };
    const manifest = convertCapToManifest(def);

    const actionDef = manifest.actions.doWork;
    expect(actionDef).toBeDefined();
    expect(typeof actionDef.handler).toBe('function');
    expect(typeof actionDef.description).toBe('string');
    expect(actionDef.description!.length).toBeGreaterThan(0);
  });

  test('manifest from registry has correct shape', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'test-registry',
      caps: [{ class: TestCap, meta: { name: 'test' } }],
    };
    const manifest = convertRegistryToManifest(registry);

    expect(manifest.name).toBe('test-registry');
    expect(manifest.actions).toBeDefined();
    expect(manifest.actions.action).toBeDefined();
    expect(typeof manifest.actions.action.handler).toBe('function');
  });

  test('manifest from convertRegistriesToManifests has correct shape', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const registries: CapsuleRegistry[] = [
      { name: 'first', caps: [{ class: CapA, meta: { name: 'a' } }] },
      { name: 'second', caps: [{ class: CapB, meta: { name: 'b' } }] },
    ];
    const manifests = convertRegistriesToManifests(registries);

    expect(manifests).toHaveLength(2);
    for (const manifest of manifests) {
      expect(typeof manifest.name).toBe('string');
      expect(typeof manifest.actions).toBe('object');
      const actionNames = Object.keys(manifest.actions);
      expect(actionNames.length).toBeGreaterThan(0);
      for (const actionName of actionNames) {
        expect(typeof manifest.actions[actionName].handler).toBe('function');
      }
    }
  });

  test('manifest with routes preserves route shape', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'test',
        routes: [
          { method: 'GET', path: '/items', action: 'action' },
          { method: 'POST', path: '/items', action: 'action' },
          { method: 'DELETE', path: '/items/:id', action: 'action' },
        ],
      },
    };
    const manifest = convertCapToManifest(def);
    const routes = (manifest as any).routes;
    expect(Array.isArray(routes)).toBe(true);
    expect(routes).toHaveLength(3);
    for (const route of routes) {
      expect(typeof route.method).toBe('string');
      expect(typeof route.path).toBe('string');
      expect(typeof route.action).toBe('string');
    }
  });

  test('manifest with events preserves event shape', () => {
    class TestCap {
      async handleCreate(input: any, ctx: any) { return {}; }
      async handleDelete(input: any, ctx: any) { return {}; }
    }
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'test',
        events: {
          publishes: ['item.created', 'item.deleted'],
          subscribes: [
            { event: 'item.created', action: 'handleCreate' },
            { event: 'item.deleted', action: 'handleDelete' },
          ],
        },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.events).toBeDefined();
    expect(Array.isArray(manifest.events!.publishes)).toBe(true);
    expect(Array.isArray(manifest.events!.subscribes)).toBe(true);

    for (const pub of manifest.events!.publishes!) {
      expect(typeof pub).toBe('string');
    }
    for (const sub of manifest.events!.subscribes!) {
      expect(typeof sub.event).toBe('string');
      expect(typeof sub.action).toBe('string');
    }
  });

  test('manifest with dependencies preserves requires shape', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = {
      class: TestCap,
      meta: { name: 'test', dependencies: ['database', 'redis', 'queue'] },
    };
    const manifest = convertCapToManifest(def);
    expect(Array.isArray(manifest.requires)).toBe(true);
    expect(manifest.requires!).toHaveLength(3);
    for (const dep of manifest.requires!) {
      expect(typeof dep).toBe('string');
      expect(dep.length).toBeGreaterThan(0);
    }
  });

  test('converting an empty array of caps returns empty array', () => {
    const manifests = convertCapsToManifests([]);
    expect(manifests).toEqual([]);
  });

  test('converting an empty array of registries returns empty array', () => {
    const manifests = convertRegistriesToManifests([]);
    expect(manifests).toEqual([]);
  });
});

// ===========================================================================
// 7. CapContext ADAPTER (createCapContext & wrapCapHandler)
// ===========================================================================

describe('CapContext Adapter', () => {
  test('createCapContext passes through body, params, query, deps, emit, use', () => {
    const mockEmit = (event: string, data: any) => {};
    const mockCall = async (action: string, payload: any) => ({ result: 'ok' });
    const mockUse = (capsuleName: string) => ({});

    const platformContext: ActionContext = {
      body: { key: 'value' },
      params: { id: '123' },
      query: { sort: 'asc' },
      deps: { db: { connected: true } },
      emit: mockEmit,
      call: mockCall,
      use: mockUse,
    };

    const capCtx = createCapContext(platformContext);

    expect(capCtx.body).toEqual({ key: 'value' });
    expect(capCtx.params).toEqual({ id: '123' });
    expect(capCtx.query).toEqual({ sort: 'asc' });
    expect(capCtx.deps).toEqual({ db: { connected: true } });
    expect(capCtx.emit).toBe(mockEmit);
    expect(capCtx.use).toBe(mockUse);
  });

  test('createCapContext maps invoke to context.call', async () => {
    const callLog: Array<{ action: string; payload: any }> = [];
    const mockCall = async (action: string, payload: any) => {
      callLog.push({ action, payload });
      return { ok: true };
    };

    const platformContext: ActionContext = {
      body: {},
      deps: {},
      emit: () => {},
      call: mockCall,
      use: () => ({}),
    };

    const capCtx = createCapContext(platformContext);
    const result = await capCtx.invoke('test.action', { body: { hello: 'world' } });

    expect(result).toEqual({ ok: true });
    expect(callLog).toHaveLength(1);
    expect(callLog[0].action).toBe('test.action');
    expect(callLog[0].payload).toEqual({ body: { hello: 'world' } });
  });

  test('createCapContext maps tell to context.call (fire-and-forget)', () => {
    const callLog: Array<{ action: string; payload: any }> = [];
    const mockCall = async (action: string, payload: any) => {
      callLog.push({ action, payload });
      return { ok: true };
    };

    const platformContext: ActionContext = {
      body: {},
      deps: {},
      emit: () => {},
      call: mockCall,
      use: () => ({}),
    };

    const capCtx = createCapContext(platformContext);
    const result = capCtx.tell('analytics.track', { body: { event: 'page.view' } });
    expect(result).toBeUndefined();

    expect(callLog).toHaveLength(1);
    expect(callLog[0].action).toBe('analytics.track');
  });

  test('wrapCapHandler adapts ActionContext to CapContext', async () => {
    const capMethod = async (input: ActionInput, ctx: CapContext): Promise<any> => {
      const result = await ctx.invoke('other.action', { body: { nested: true } });
      return { input: input.body, invoked: result };
    };

    const callLog: any[] = [];
    const platformContext: ActionContext = {
      body: { original: 'data' },
      params: {},
      deps: {},
      emit: () => {},
      call: async (action: string, payload: any) => {
        callLog.push({ action, payload });
        return { nestedResult: true };
      },
      use: () => ({}),
    };

    const wrappedHandler = wrapCapHandler(capMethod);
    const result = await wrappedHandler({ body: { hello: 'world' } }, platformContext);

    expect(result).toEqual({
      input: { hello: 'world' },
      invoked: { nestedResult: true },
    });
    expect(callLog).toHaveLength(1);
    expect(callLog[0].action).toBe('other.action');
  });

  test('wrapCapHandler passes query through to CapContext', async () => {
    const capMethod = async (input: ActionInput, ctx: CapContext): Promise<any> => {
      return { query: ctx.query };
    };

    const platformContext: ActionContext = {
      body: {},
      query: { page: '1', limit: '10' },
      deps: {},
      emit: () => {},
      call: async () => ({}),
      use: () => ({}),
    };

    const wrappedHandler = wrapCapHandler(capMethod);
    const result = await wrappedHandler({ body: {} }, platformContext);

    expect(result).toEqual({ query: { page: '1', limit: '10' } });
  });

  test('wrapCapHandler provides default empty query object', async () => {
    const capMethod = async (input: ActionInput, ctx: CapContext): Promise<any> => {
      return { query: ctx.query };
    };

    const platformContext: ActionContext = {
      body: {},
      deps: {},
      emit: () => {},
      call: async () => ({}),
      use: () => ({}),
    };

    const wrappedHandler = wrapCapHandler(capMethod);
    const result = await wrappedHandler({ body: {} }, platformContext);

    expect(result).toEqual({ query: {} });
  });

  test('createCapContext provides query as empty object when undefined', () => {
    const platformContext: ActionContext = {
      body: {},
      deps: {},
      emit: () => {},
      call: async () => ({}),
      use: () => ({}),
    };

    const capCtx = createCapContext(platformContext);
    expect(capCtx.query).toEqual({});
  });
});

// ===========================================================================
// 8. REGISTRY MANIFEST MERGE SPECIFICS
// ===========================================================================

describe('Registry Manifest Merge Specifics', () => {
  test('routes from multiple caps are concatenated in order', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    class CapC { async c(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'ordered-routes',
      caps: [
        {
          class: CapA,
          meta: { name: 'a', routes: [{ method: 'GET', path: '/a', action: 'a' }] },
        },
        {
          class: CapB,
          meta: { name: 'b', routes: [{ method: 'POST', path: '/b', action: 'b' }] },
        },
        {
          class: CapC,
          meta: { name: 'c', routes: [{ method: 'PUT', path: '/c', action: 'c' }] },
        },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    const routes = (manifest as any).routes;
    expect(routes).toHaveLength(3);
    expect(routes[0].path).toBe('/a');
    expect(routes[1].path).toBe('/b');
    expect(routes[2].path).toBe('/c');
  });

  test('registry with single cap is handled same as convertCapToManifest', () => {
    class TestCap { async action(input: any, ctx: any) { return { value: 42 }; } }
    const def: CapDefinition = { class: TestCap, meta: { name: 'single' } };

    const singleManifest = convertCapToManifest(def);
    const registry: CapsuleRegistry = {
      name: 'single',
      caps: [def],
    };
    const registryManifest = convertRegistryToManifest(registry);

    expect(singleManifest.name).toBe(registryManifest.name);
    expect(Object.keys(singleManifest.actions)).toHaveLength(Object.keys(registryManifest.actions).length);
    expect(registryManifest.actions.action).toBeDefined();
  });

  test('registry manifest preserves extra properties from caps', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'extra',
      caps: [
        {
          class: CapA,
          meta: {
            name: 'a',
            routes: [{ method: 'GET', path: '/extra', action: 'a' }],
            events: { publishes: ['extra.event'] },
            dependencies: ['extra-dep'],
          },
        },
      ],
    };
    const manifest = convertRegistryToManifest(registry);

    expect(manifest.name).toBe('extra');
    expect(manifest.actions.a).toBeDefined();
    expect(manifest.requires).toEqual(['extra-dep']);
    expect(manifest.events?.publishes).toEqual(['extra.event']);
    expect((manifest as any).routes).toBeDefined();
    expect((manifest as any).routes).toHaveLength(1);
  });

  test('throws CapLoadError when registry has no action methods across all caps', () => {
    class EmptyA { constructor() {} }
    class EmptyB { constructor() {} }
    const registry: CapsuleRegistry = {
      name: 'all-empty',
      caps: [
        { class: EmptyA as any, meta: { name: 'a' } },
        { class: EmptyB as any, meta: { name: 'b' } },
      ],
    };
    expect(() => convertRegistryToManifest(registry)).toThrow(CapLoadError);
  });
});

// ===========================================================================
// 9. CapActionMeta MERGING (Per-Method Metadata)
// ===========================================================================

describe('CapActionMeta Merging', () => {
  test('action description from meta.actions overrides default', () => {
    class TestCap { async doWork(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'test',
        actions: {
          doWork: { description: 'Custom description for doWork' },
        },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.doWork.description).toBe('Custom description for doWork');
  });

  test('default description used when no CapActionMeta entry', () => {
    class TestCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = { class: TestCap, meta: { name: 'test' } };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.action.description).toBe('Cap "test" action: action');
  });

  test('inputSchema from meta.actions is propagated', () => {
    class TestCap { async sum(input: any, ctx: any) { return {}; } }
    const schema = { type: 'object' as const, properties: { a: { type: 'number' as const } }, required: ['a'] };
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'math',
        actions: { sum: { inputSchema: schema } },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.sum.inputSchema).toEqual(schema);
  });

  test('deprecated schema field is mapped to inputSchema', () => {
    class TestCap { async sum(input: any, ctx: any) { return {}; } }
    const schema = { type: 'object' as const, properties: { a: { type: 'number' as const } } };
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'math',
        actions: { sum: { schema } },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.sum.inputSchema).toEqual(schema);
  });

  test('outputSchema from meta.actions is propagated', () => {
    class TestCap { async get(input: any, ctx: any) { return {}; } }
    const outputSchema = {
      strict: true,
      schema: { type: 'object' as const, properties: { id: { type: 'string' as const } } },
    };
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'test',
        actions: { get: { outputSchema } },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.get.outputSchema).toEqual(outputSchema);
  });

  test('cache from meta.actions is propagated', () => {
    class TestCap { async data(input: any, ctx: any) { return {}; } }
    const cache = { ttl: 60000, storage: 'memory' as const };
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'test',
        actions: { data: { cache } },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.data.cache).toEqual(cache);
  });

  test('resiliency from meta.actions is propagated', () => {
    class TestCap { async fragile(input: any, ctx: any) { return {}; } }
    const resiliency = { fallback: { type: 'retry' as const, maxRetries: 3 } };
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'test',
        actions: { fragile: { resiliency } },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.fragile.resiliency).toEqual(resiliency);
  });

  test('multiple action metas are merged independently', () => {
    class TestCap {
      async create(input: any, ctx: any) { return {}; }
      async delete(input: any, ctx: any) { return {}; }
    }
    const def: CapDefinition = {
      class: TestCap,
      meta: {
        name: 'crud',
        actions: {
          create: { description: 'Creates a resource' },
          delete: { description: 'Deletes a resource' },
        },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.create.description).toBe('Creates a resource');
    expect(manifest.actions.delete.description).toBe('Deletes a resource');
  });

  test('registry manifest merges action meta across caps', () => {
    class CapA { async shared(input: any, ctx: any) { return {}; } async onlyA(input: any, ctx: any) { return {}; } }
    class CapB { async shared(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'merged',
      caps: [
        {
          class: CapA,
          meta: {
            name: 'a',
            actions: {
              shared: { description: 'from cap A' },
              onlyA: { description: 'exclusive to A' },
            },
          },
        },
        {
          class: CapB,
          meta: {
            name: 'b',
            actions: {
              shared: { description: 'from cap B (last wins)' },
            },
          },
        },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.actions.shared.description).toBe('from cap B (last wins)');
    expect(manifest.actions.onlyA.description).toBe('exclusive to A');
  });

  test('no actions meta object is fine — defaults used', () => {
    class TestCap { async work(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = { class: TestCap, meta: { name: 'test' } };
    const manifest = convertCapToManifest(def);
    expect(manifest.actions.work.inputSchema).toBeUndefined();
    expect(manifest.actions.work.outputSchema).toBeUndefined();
    expect(manifest.actions.work.cache).toBeUndefined();
    expect(manifest.actions.work.resiliency).toBeUndefined();
  });
});

// ===========================================================================
// 10. CONSTRUCTOR DI (Dependency Injection into CapClass)
// ===========================================================================

describe('Constructor DI', () => {
  test('convertCapToManifest passes deps to constructor when provided', () => {
    let receivedDeps: any = null;
    class DiCap {
      constructor(deps?: Record<string, any>) {
        receivedDeps = deps;
      }
      async action(input: any, ctx: any) { return {}; }
    }
    const def: CapDefinition = { class: DiCap, meta: { name: 'di-test' } };
    const deps = { db: { query: () => {} }, redis: { get: () => {} } };
    convertCapToManifest(def, undefined, deps);
    expect(receivedDeps).toBe(deps);
  });

  test('convertCapToManifest works with no deps (backward compat)', () => {
    class SimpleCap { async action(input: any, ctx: any) { return { ok: true }; } }
    const def: CapDefinition = { class: SimpleCap, meta: { name: 'simple' } };
    // Should not throw — no constructor args
    const manifest = convertCapToManifest(def);
    expect(manifest.name).toBe('simple');
  });

  test('convertRegistryToManifest passes deps to each cap constructor', () => {
    const received: string[] = [];
    class CapA {
      constructor(deps?: any) { received.push('a:' + (deps?.key ?? 'none')); }
      async a(input: any, ctx: any) { return {}; }
    }
    class CapB {
      constructor(deps?: any) { received.push('b:' + (deps?.key ?? 'none')); }
      async b(input: any, ctx: any) { return {}; }
    }
    const registry: CapsuleRegistry = {
      name: 'di-registry',
      caps: [
        { class: CapA, meta: { name: 'a' } },
        { class: CapB, meta: { name: 'b' } },
      ],
    };
    convertRegistryToManifest(registry, { key: 'my-value' });
    expect(received).toContain('a:my-value');
    expect(received).toContain('b:my-value');
  });

  test('constructor DI with convertCapsToManifests (still works, no deps)', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const defs: CapDefinition[] = [
      { class: CapA, meta: { name: 'a' } },
      { class: CapB, meta: { name: 'b' } },
    ];
    const manifests = convertCapsToManifests(defs);
    expect(manifests).toHaveLength(2);
    expect(manifests[0].name).toBe('a');
    expect(manifests[1].name).toBe('b');
  });
});

// ===========================================================================
// 11. BOOT LIFECYCLE ON CapMeta
// ===========================================================================

describe('Boot Lifecycle on CapMeta', () => {
  test('convertCapToManifest includes boot when meta.boot is defined', () => {
    class BootCap { async action(input: any, ctx: any) { return {}; } }
    const boot: any = { init: async () => {}, timeout: 5000 };
    const def: CapDefinition = {
      class: BootCap,
      meta: { name: 'boot-test', boot },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.boot).toBeDefined();
    expect(manifest.boot?.init).toBe(boot.init);
    expect(manifest.boot?.timeout).toBe(5000);
  });

  test('convertCapToManifest omits boot when not defined', () => {
    class SimpleCap { async action(input: any, ctx: any) { return {}; } }
    const def: CapDefinition = { class: SimpleCap, meta: { name: 'no-boot' } };
    const manifest = convertCapToManifest(def);
    expect(manifest.boot).toBeUndefined();
  });

  test('convertRegistryToManifest picks first cap boot', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const bootA: any = { init: async () => { /* from A */ } };
    const bootB: any = { init: async () => { /* from B */ } };
    const registry: CapsuleRegistry = {
      name: 'boot-first',
      caps: [
        { class: CapA, meta: { name: 'a', boot: bootA } },
        { class: CapB, meta: { name: 'b', boot: bootB } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.boot?.init).toBe(bootA.init);
  });

  test('convertRegistryToManifest omits boot when no caps have it', () => {
    class CapA { async a(input: any, ctx: any) { return {}; } }
    class CapB { async b(input: any, ctx: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'no-boot-registry',
      caps: [
        { class: CapA, meta: { name: 'a' } },
        { class: CapB, meta: { name: 'b' } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.boot).toBeUndefined();
  });
});
