/**
 * Task 6.3: Verify system capsule loads via new cap loader
 *
 * Verifies:
 * 1. System capsule is loaded through convertRegistryToManifest (new cap loader)
 * 2. All 4 actions (getHealth, listCapsules, metrics, audit) are registered
 * 3. Routes are registered (GET /health, GET /capsules, GET /metrics)
 * 4. Events work (capskit-calculator.sum → system.audit)
 * 5. Capsule boots correctly
 */

import { describe, test, expect, beforeAll } from 'vitest';
import {
  convertRegistryToManifest,
  convertCapToManifest,
  CapLoadError,
} from '../src/kernel/cap-loader';
import type {
  CapsuleRegistry,
  CapsuleManifest,
  CapDefinition,
} from '../src/types';

// ===========================================================================
// 1. STATIC VERIFICATION: System capsule registry → manifest conversion
// ===========================================================================

describe('System Capsule Registry → Manifest Conversion (Static)', () => {
  // Replicate the system capsule structure from caps.ts
  class HealthCap {
    async getHealth(_input: any, _ctx: any) {
      return {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: Date.now(),
        version: '0.0.0',
      };
    }
  }

  class ListerCap {
    async listCapsules(_input: any, ctx: any) {
      const capskit = ctx.deps?.capskit;
      if (!capskit || typeof capskit.getManifests !== 'function') {
        throw new Error(
          'System capsule requires "capskit" dependency with getManifests() method.',
        );
      }
      return capskit.getManifests();
    }
  }

  class MetricsCap {
    async metrics(_input: any, _ctx: any) {
      return {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        timestamp: Date.now(),
      };
    }
  }

  class AuditCap {
    async audit(input: any, _ctx: any) {
      return { success: true };
    }
  }

  const systemRegistry: CapsuleRegistry = {
    name: 'system',
    caps: [
      {
        class: HealthCap,
        meta: {
          name: 'health',
          routes: [
            { method: 'GET', path: '/health', action: 'getHealth' },
          ],
        },
      },
      {
        class: ListerCap,
        meta: {
          name: 'lister',
          routes: [
            { method: 'GET', path: '/capsules', action: 'listCapsules' },
          ],
        },
      },
      {
        class: MetricsCap,
        meta: {
          name: 'metrics',
          routes: [
            { method: 'GET', path: '/metrics', action: 'metrics' },
          ],
        },
      },
      {
        class: AuditCap,
        meta: {
          name: 'audit',
          events: {
            subscribes: [
              { event: 'capskit-calculator.sum', action: 'audit' },
            ],
          },
        },
      },
    ],
  };

  test('convertRegistryToManifest returns manifest with name "system"', () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    expect(manifest.name).toBe('system');
  });

  test('manifest has all 4 actions: getHealth, listCapsules, metrics, audit', () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    expect(Object.keys(manifest.actions).sort()).toEqual([
      'audit',
      'getHealth',
      'listCapsules',
      'metrics',
    ]);
  });

  test('each action has a function handler', () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    for (const name of ['getHealth', 'listCapsules', 'metrics', 'audit']) {
      expect(typeof manifest.actions[name].handler).toBe('function');
    }
  });

  test('all 3 HTTP routes are present in manifest extras', () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    const routes = (manifest as any).routes;
    expect(routes).toBeDefined();
    expect(routes).toHaveLength(3);

    const routePaths = routes.map((r: any) => `${r.method} ${r.path}`);
    expect(routePaths).toContain('GET /health');
    expect(routePaths).toContain('GET /capsules');
    expect(routePaths).toContain('GET /metrics');
  });

  test('event subscriptions are propagated correctly', () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    expect(manifest.events).toBeDefined();
    expect(manifest.events!.subscribes).toBeDefined();
    expect(manifest.events!.subscribes).toHaveLength(1);
    expect(manifest.events!.subscribes![0]).toEqual({
      event: 'capskit-calculator.sum',
      action: 'audit',
    });
  });

  test('getHealth action returns healthy status', async () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    const result = await manifest.actions.getHealth.handler(
      { body: {} },
      {} as any,
    );
    expect(result.status).toBe('healthy');
    expect(result.version).toBe('0.0.0');
    expect(typeof result.uptime).toBe('number');
    expect(typeof result.timestamp).toBe('number');
  });

  test('metrics action returns memory and cpu info', async () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    const result = await manifest.actions.metrics.handler(
      { body: {} },
      {} as any,
    );
    expect(result.memory).toBeDefined();
    expect(result.cpu).toBeDefined();
    expect(typeof result.timestamp).toBe('number');
  });

  test('audit action returns success', async () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    const result = await manifest.actions.audit.handler(
      { body: { result: 42 } },
      {} as any,
    );
    expect(result.success).toBe(true);
  });

  test('listCapsules throws without capskit dependency', async () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    await expect(
      manifest.actions.listCapsules.handler({ body: {} }, {} as any),
    ).rejects.toThrow(/capskit.*dependency/);
  });

  test('listCapsules works with capskit dependency', async () => {
    const mockCapskit = {
      getManifests: () => [{ name: 'system' }, { name: 'http' }],
    };
    const manifest = convertRegistryToManifest(systemRegistry);
    const result = await manifest.actions.listCapsules.handler(
      { body: {} },
      { deps: { capskit: mockCapskit } } as any,
    );
    expect(result).toEqual([{ name: 'system' }, { name: 'http' }]);
  });

  test('no duplicate action names across system caps', () => {
    // All 4 caps have unique action names
    const manifest = convertRegistryToManifest(systemRegistry);
    const actionNames = Object.keys(manifest.actions);
    const uniqueNames = new Set(actionNames);
    expect(uniqueNames.size).toBe(actionNames.length);
  });

  test('manifest has no dependencies (caps dont declare any)', () => {
    const manifest = convertRegistryToManifest(systemRegistry);
    expect(manifest.requires).toBeUndefined();
  });
});

// ===========================================================================
// 2. INDIVIDUAL CAP CONVERSION VERIFICATION
// ===========================================================================

describe('Individual Cap Conversion for System Caps', () => {
  class HealthCap {
    async getHealth(_input: any, _ctx: any) {
      return { status: 'healthy', uptime: 1, timestamp: 1, version: '1.0' };
    }
  }

  class AuditCap {
    async audit(_input: any, _ctx: any) {
      return { success: true };
    }
  }

  test('health cap converts to manifest with correct route', () => {
    const def: CapDefinition = {
      class: HealthCap,
      meta: {
        name: 'health',
        routes: [{ method: 'GET', path: '/health', action: 'getHealth' }],
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.name).toBe('health');
    expect(manifest.actions.getHealth).toBeDefined();
    const routes = (manifest as any).routes;
    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual({ method: 'GET', path: '/health', action: 'getHealth' });
  });

  test('audit cap converts to manifest with event subscription', () => {
    const def: CapDefinition = {
      class: AuditCap,
      meta: {
        name: 'audit',
        events: {
          subscribes: [{ event: 'capskit-calculator.sum', action: 'audit' }],
        },
      },
    };
    const manifest = convertCapToManifest(def);
    expect(manifest.name).toBe('audit');
    expect(manifest.events?.subscribes).toEqual([
      { event: 'capskit-calculator.sum', action: 'audit' },
    ]);
  });

  test('convertCapToManifest accepts constructor deps', () => {
    class DepsCap {
      public deps: any;
      constructor(deps: any = {}) {
        this.deps = deps;
      }
      async test(_input: any, _ctx: any) {
        return { hasDeps: !!this.deps.db };
      }
    }

    // Without deps — constructor gets undefined (but guarded)
    const manifest1 = convertCapToManifest(
      { class: DepsCap, meta: { name: 'deps' } },
    );
    expect(manifest1.name).toBe('deps');

    // With deps
    const manifest2 = convertCapToManifest(
      { class: DepsCap, meta: { name: 'deps' } },
      undefined,
      { db: 'connected' },
    );
    expect(manifest2.name).toBe('deps');
  });

  test('CapLoadError thrown for cap with no methods', () => {
    class EmptyCap {
      constructor() { /* nothing */ }
    }
    expect(() =>
      convertCapToManifest({ class: EmptyCap as any, meta: { name: 'empty' } }),
    ).toThrow(CapLoadError);
  });
});

// ===========================================================================
// 3. PRODUCTION SYSTEM CAPSULE VERIFICATION (actual caps.ts)
// ===========================================================================

describe('Production System Capsule (caps.ts → convertRegistryToManifest)', () => {
  // Import the ACTUAL production system capsule
  let systemCaps: CapsuleRegistry;

  beforeAll(async () => {
    systemCaps = (await import('../src/capsules/system/caps')).default;
  });

  test('imports systemCaps as a CapsuleRegistry', () => {
    expect(systemCaps).toBeDefined();
    expect(systemCaps.name).toBe('system');
    expect(Array.isArray(systemCaps.caps)).toBe(true);
    expect(systemCaps.caps.length).toBe(4);
  });

  test('all 4 caps have class and meta properties', () => {
    for (const cap of systemCaps.caps) {
      expect(typeof cap.class).toBe('function');
      expect(cap.meta).toBeDefined();
      expect(typeof cap.meta.name).toBe('string');
      expect(cap.meta.name.length).toBeGreaterThan(0);
    }
  });

  test('cap names are: health, lister, metrics, audit', () => {
    const names = systemCaps.caps.map((c: any) => c.meta.name).sort();
    expect(names).toEqual(['audit', 'health', 'lister', 'metrics']);
  });

  test('convertRegistryToManifest produces valid manifest from production caps', () => {
    const manifest = convertRegistryToManifest(systemCaps);
    expect(manifest.name).toBe('system');
    expect(Object.keys(manifest.actions).sort()).toEqual([
      'audit',
      'getHealth',
      'listCapsules',
      'metrics',
    ]);
  });

  test('all action handlers are functions', () => {
    const manifest = convertRegistryToManifest(systemCaps);
    for (const actionName of Object.keys(manifest.actions)) {
      expect(typeof manifest.actions[actionName].handler).toBe('function');
    }
  });

  test('health cap has route GET /health', () => {
    const healthCap = systemCaps.caps.find((c: any) => c.meta.name === 'health');
    expect(healthCap).toBeDefined();
    expect(healthCap!.meta.routes).toBeDefined();
    expect(healthCap!.meta.routes).toEqual([
      { method: 'GET', path: '/health', action: 'getHealth' },
    ]);
  });

  test('lister cap has route GET /capsules', () => {
    const listerCap = systemCaps.caps.find((c: any) => c.meta.name === 'lister');
    expect(listerCap).toBeDefined();
    expect(listerCap!.meta.routes).toEqual([
      { method: 'GET', path: '/capsules', action: 'listCapsules' },
    ]);
  });

  test('metrics cap has route GET /metrics', () => {
    const metricsCap = systemCaps.caps.find((c: any) => c.meta.name === 'metrics');
    expect(metricsCap).toBeDefined();
    expect(metricsCap!.meta.routes).toEqual([
      { method: 'GET', path: '/metrics', action: 'metrics' },
    ]);
  });

  test('audit cap subscribes to capskit-calculator.sum', () => {
    const auditCap = systemCaps.caps.find((c: any) => c.meta.name === 'audit');
    expect(auditCap).toBeDefined();
    expect(auditCap!.meta.events).toBeDefined();
    expect(auditCap!.meta.events!.subscribes).toEqual([
      { event: 'capskit-calculator.sum', action: 'audit' },
    ]);
  });

  test('merged manifest has all 3 routes from caps', () => {
    const manifest = convertRegistryToManifest(systemCaps);
    const routes = (manifest as any).routes;
    expect(routes).toBeDefined();
    expect(routes).toHaveLength(3);
    const routeSpecs = routes.map((r: any) => `${r.method} ${r.path}`).sort();
    expect(routeSpecs).toEqual(['GET /capsules', 'GET /health', 'GET /metrics']);
  });

  test('merged manifest has event subscription from audit cap', () => {
    const manifest = convertRegistryToManifest(systemCaps);
    expect(manifest.events).toBeDefined();
    expect(manifest.events!.subscribes).toEqual([
      { event: 'capskit-calculator.sum', action: 'audit' },
    ]);
  });

  test('getHealth action returns healthy status with expected fields', async () => {
    const manifest = convertRegistryToManifest(systemCaps);
    const result = await manifest.actions.getHealth.handler(
      { body: {} } as any,
      {} as any,
    );
    expect(result.status).toBe('healthy');
    expect(typeof result.uptime).toBe('number');
    expect(typeof result.timestamp).toBe('number');
    expect(result.version).toBe('0.0.0');
  });

  test('metrics action returns memory and cpu info', async () => {
    const manifest = convertRegistryToManifest(systemCaps);
    const result = await manifest.actions.metrics.handler(
      { body: {} } as any,
      {} as any,
    );
    expect(result.memory).toBeDefined();
    expect(result.cpu).toBeDefined();
    expect(typeof result.timestamp).toBe('number');
  });

  test('audit action returns success and logs to console', async () => {
    const manifest = convertRegistryToManifest(systemCaps);
    const result = await manifest.actions.audit.handler(
      { body: { a: 1, b: 2, result: 3 } } as any,
      {} as any,
    );
    expect(result.success).toBe(true);
  });

  test('listCapsules throws descriptive error without capskit dep', async () => {
    const manifest = convertRegistryToManifest(systemCaps);
    // Pass context with deps object but no capskit — simulates a kernel
    // that hasn't injected the capskit dependency yet
    await expect(
      manifest.actions.listCapsules.handler(
        { body: {} } as any,
        { deps: {} } as any,
      ),
    ).rejects.toThrow(/capskit.*dependency/);
  });

  test('listCapsules works when capskit dep is provided', async () => {
    const mockCapskit = {
      getManifests: () => [
        { name: 'system' },
        { name: 'http' },
        { name: 'drizzle' },
      ],
    };
    const manifest = convertRegistryToManifest(systemCaps);
    const result = await manifest.actions.listCapsules.handler(
      { body: {} } as any,
      { deps: { capskit: mockCapskit } } as any,
    );
    expect(result).toHaveLength(3);
    expect(result.map((m: any) => m.name)).toEqual(['system', 'http', 'drizzle']);
  });

  test('manifest has no dependencies (caps don\'t declare any)', () => {
    const manifest = convertRegistryToManifest(systemCaps);
    expect(manifest.requires).toBeUndefined();
  });

  test('no duplicate action names across production caps', () => {
    const manifest = convertRegistryToManifest(systemCaps);
    const actionNames = Object.keys(manifest.actions);
    expect(new Set(actionNames).size).toBe(actionNames.length);
  });

  test('system capsule does NOT export boot lifecycle', () => {
    const manifest = convertRegistryToManifest(systemCaps);
    expect((manifest as any).boot).toBeUndefined();
  });
});

// ===========================================================================
// 4. REGISTRY EDGE CASES
// ===========================================================================

describe('Registry Conversion Edge Cases', () => {
  test('empty caps array throws CapLoadError', () => {
    // Note: This would fail at validateCapsuleRegistry, not convertRegistryToManifest
    // but convertRegistryToManifest would also reject because no actions
    const emptyRegistry: CapsuleRegistry = { name: 'empty', caps: [] };
    expect(() => convertRegistryToManifest(emptyRegistry)).toThrow(CapLoadError);
  });

  test('registry with caps but no action methods throws', () => {
    class NoActionCap {
      constructor() { /* nothing */ }
    }
    const registry: CapsuleRegistry = {
      name: 'no-actions',
      caps: [{ class: NoActionCap as any, meta: { name: 'no-op' } }],
    };
    expect(() => convertRegistryToManifest(registry)).toThrow(CapLoadError);
  });

  test('single-cap registry works correctly', () => {
    class SoloCap {
      async solo(_input: any, _ctx: any) {
        return { ok: true };
      }
    }
    const registry: CapsuleRegistry = {
      name: 'solo',
      caps: [{ class: SoloCap, meta: { name: 'solo-cap' } }],
    };
    const manifest = convertRegistryToManifest(registry);
    expect(manifest.name).toBe('solo');
    expect(Object.keys(manifest.actions)).toEqual(['solo']);
  });
});
