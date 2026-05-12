/**
 * Cap Loader Integration Tests
 *
 * Tests the complete cap loading pipeline:
 * 1. validateCapMeta - Meta validation
 * 2. validateCapClass - Class validation
 * 3. loadCapFromDir - Dynamic file loading
 * 4. loadCapsFromDirectory - Directory scanning
 * 5. convertCapToManifest - Manifest conversion
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  validateCapMeta,
  validateCapClass,
  loadCapFromDir,
  loadCapsFromDirectory,
  convertCapToManifest,
  convertCapsToManifests,
  validateCapsuleRegistry,
  loadCapsRegistry,
  convertRegistryToManifest,
  convertRegistriesToManifests,
  loadCapsRegistriesFromDirectory,
  CapLoadError,
  DuplicateCapNameError,
  CapCycleError,
  detectDuplicateCapNames,
  detectDuplicateRegistryNames,
  detectCapCycle,
} from '../src/kernel/cap-loader';
import type { CapMeta, CapDefinition, CapsuleRegistry } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, 'cap-loader-fixtures');

// ---------------------------------------------------------------------------
// Helper: count fixture directories
// ---------------------------------------------------------------------------
function countCapDirs(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.endsWith('.cap')).length;
}

// ---------------------------------------------------------------------------
// VALIDATION TESTS
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

function testAsync(name: string, fn: () => Promise<void>) {
  return async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (e: any) {
      failed++;
      console.log(`  ❌ ${name}`);
      console.log(`     ${e.message}`);
    }
  };
}

// ── validateCapMeta ──────────────────────────────────────────

console.log('\n📦 validateCapMeta');

test('accepts valid meta with all fields', () => {
  const meta: CapMeta = {
    name: 'test-cap',
    routes: [{ method: 'POST', path: '/test', action: 'handle' }],
    events: {
      publishes: ['test.done'],
      subscribes: [{ event: 'user.created', action: 'onUser' }]
    },
    dependencies: ['db']
  };
  const result = validateCapMeta(meta, '/path');
  assert.equal(result.name, 'test-cap');
  assert.equal(result.routes?.length, 1);
});

test('accepts minimal meta (name only)', () => {
  const result = validateCapMeta({ name: 'minimal' }, '/path');
  assert.equal(result.name, 'minimal');
});

test('rejects null meta', () => {
  assert.throws(() => validateCapMeta(null, '/path'), CapLoadError);
});

test('rejects missing name', () => {
  assert.throws(() => validateCapMeta({}, '/path'), CapLoadError);
});

test('rejects invalid name format (spaces)', () => {
  assert.throws(() => validateCapMeta({ name: 'hello world' }, '/path'), CapLoadError);
});

test('rejects invalid name format (special chars)', () => {
  assert.throws(() => validateCapMeta({ name: 'test@cap!' }, '/path'), CapLoadError);
});

test('rejects non-array routes', () => {
  assert.throws(() => validateCapMeta({ name: 'x', routes: 'bad' }, '/path'), CapLoadError);
});

test('rejects invalid route method', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', routes: [{ method: 'INVALID', path: '/', action: 'a' }] }, '/path'),
    CapLoadError
  );
});

test('rejects missing route path', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', routes: [{ method: 'GET', path: '', action: 'a' }] }, '/path'),
    CapLoadError
  );
});

test('rejects missing route action', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', routes: [{ method: 'GET', path: '/', action: '' }] }, '/path'),
    CapLoadError
  );
});

test('rejects events as array (should be object)', () => {
  assert.throws(() => validateCapMeta({ name: 'x', events: [] }, '/path'), CapLoadError);
});

test('rejects non-array publishes', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { publishes: 'bad' } }, '/path'),
    CapLoadError
  );
});

test('rejects non-array subscribes', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { subscribes: 'bad' } }, '/path'),
    CapLoadError
  );
});

test('rejects subscribe missing event', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { subscribes: [{ event: '', action: 'x' }] } }, '/path'),
    CapLoadError
  );
});

test('rejects subscribe missing action', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { subscribes: [{ event: 'x', action: '' }] } }, '/path'),
    CapLoadError
  );
});

test('rejects non-array dependencies', () => {
  assert.throws(() => validateCapMeta({ name: 'x', dependencies: 'bad' }, '/path'), CapLoadError);
});

test('rejects empty string dependency', () => {
  assert.throws(() => validateCapMeta({ name: 'x', dependencies: [''] }, '/path'), CapLoadError);
});

// ── validateCapClass ─────────────────────────────────────────

console.log('\n📦 validateCapClass');

class GoodCap { async handle(input: any, ctx: any) { return {}; } }
class NoMethodCap { constructor() {} }

test('accepts valid class with methods', () => {
  validateCapClass(GoodCap, '/path');
});

test('rejects null export', () => {
  assert.throws(() => validateCapClass(null, '/path'), CapLoadError);
});

test('rejects undefined export', () => {
  assert.throws(() => validateCapClass(undefined, '/path'), CapLoadError);
});

test('rejects string export', () => {
  assert.throws(() => validateCapClass('not a class', '/path'), CapLoadError);
});

test('rejects plain object export', () => {
  assert.throws(() => validateCapClass({ handle: () => {} }, '/path'), CapLoadError);
});

test('rejects class with no methods', () => {
  assert.throws(() => validateCapClass(NoMethodCap, '/path'), CapLoadError);
});

// ── CapLoadError ──────────────────────────────────────────────

console.log('\n📦 CapLoadError');

test('has correct name property', () => {
  const err = new CapLoadError('test', '/file.ts');
  assert.equal(err.name, 'CapLoadError');
});

test('has filePath property', () => {
  const err = new CapLoadError('test', '/file.ts');
  assert.equal(err.filePath, '/file.ts');
});

test('message is set correctly', () => {
  const err = new CapLoadError('my error message');
  assert.equal(err.message, 'my error message');
});

// ── convertCapToManifest ─────────────────────────────────────

console.log('\n📦 convertCapToManifest');

class CalcCap {
  async sum(input: any, ctx: any) { return { r: 1 }; }
  async mul(input: any, ctx: any) { return { r: 2 }; }
}

test('creates manifest with correct name', () => {
  const def: CapDefinition = { class: CalcCap, meta: { name: 'calc' } };
  const manifest = convertCapToManifest(def);
  assert.equal(manifest.name, 'calc');
});

test('binds class methods as actions', () => {
  const def: CapDefinition = { class: CalcCap, meta: { name: 'calc' } };
  const manifest = convertCapToManifest(def);
  assert.ok(manifest.actions.sum, 'sum action should exist');
  assert.ok(manifest.actions.mul, 'mul action should exist');
});

test('maps dependencies to requires', () => {
  const def: CapDefinition = {
    class: CalcCap,
    meta: { name: 'calc', dependencies: ['db', 'cache'] }
  };
  const manifest = convertCapToManifest(def);
  assert.deepStrictEqual(manifest.requires, ['db', 'cache']);
});

test('maps event publishes', () => {
  const def: CapDefinition = {
    class: CalcCap,
    meta: { name: 'calc', events: { publishes: ['done', 'error'] } }
  };
  const manifest = convertCapToManifest(def);
  assert.deepStrictEqual(manifest.events?.publishes, ['done', 'error']);
});

test('maps event subscribes', () => {
  const def: CapDefinition = {
    class: CalcCap,
    meta: { name: 'calc', events: { subscribes: [{ event: 'x', action: 'sum' }] } }
  };
  const manifest = convertCapToManifest(def);
  assert.deepStrictEqual(manifest.events?.subscribes, [{ event: 'x', action: 'sum' }]);
});

test('maps routes as extra manifest property', () => {
  const def: CapDefinition = {
    class: CalcCap,
    meta: { name: 'calc', routes: [{ method: 'POST', path: '/sum', action: 'sum' }] }
  };
  const manifest = convertCapToManifest(def);
  assert.ok((manifest as any).routes, 'routes should be on manifest');
  assert.equal((manifest as any).routes.length, 1);
});

test('uses custom capsuleName override', () => {
  const def: CapDefinition = { class: CalcCap, meta: { name: 'calc' } };
  const manifest = convertCapToManifest(def, 'custom-name');
  assert.equal(manifest.name, 'custom-name');
});

test('action handlers are bound functions', () => {
  const def: CapDefinition = { class: CalcCap, meta: { name: 'calc' } };
  const manifest = convertCapToManifest(def);
  assert.equal(typeof manifest.actions.sum.handler, 'function');
});

// ── convertCapsToManifests ───────────────────────────────────

console.log('\n📦 convertCapsToManifests');

test('converts multiple caps', () => {
  const defs: CapDefinition[] = [
    { class: CalcCap, meta: { name: 'calc1' } },
    { class: CalcCap, meta: { name: 'calc2', dependencies: ['db'] } }
  ];
  const manifests = convertCapsToManifests(defs);
  assert.equal(manifests.length, 2);
  assert.equal(manifests[0].name, 'calc1');
  assert.equal(manifests[1].name, 'calc2');
  assert.equal(manifests[1].requires?.[0], 'db');
});

// ── loadCapFromDir (integration) ─────────────────────────────

console.log('\n📦 loadCapFromDir (integration)');

(async () => {
  await testAsync('loads calculator.cap with named exports', async () => {
    const calcDir = path.resolve(FIXTURES_DIR, 'calculator.cap');
    assert.ok(fs.existsSync(calcDir), `Fixture dir should exist: ${calcDir}`);
    const capDef = await loadCapFromDir(calcDir);
    assert.ok(capDef, 'Should return a CapDefinition');
    assert.equal(capDef!.meta.name, 'calculator');
    assert.ok(capDef!.class, 'Should have a class');
  })();

  await testAsync('loads auth.cap with default exports', async () => {
    const authDir = path.resolve(FIXTURES_DIR, 'auth.cap');
    const capDef = await loadCapFromDir(authDir);
    assert.ok(capDef, 'Should return a CapDefinition');
    assert.equal(capDef!.meta.name, 'auth');
    assert.ok(capDef!.meta.dependencies?.includes('database'), 'Should have database dependency');
  })();

  await testAsync('throws CapLoadError for missing cap.ts', async () => {
    const brokenDir = path.resolve(FIXTURES_DIR, 'broken.cap');
    await assert.rejects(
      () => loadCapFromDir(brokenDir),
      CapLoadError
    );
  })();

  await testAsync('returns null for non-cap directory', async () => {
    const result = await loadCapFromDir(FIXTURES_DIR);
    assert.equal(result, null, 'Should return null for root fixtures dir');
  })();

  // ── loadCapsFromDirectory ────────────────────────────────────

  console.log('\n📦 loadCapsFromDirectory (integration)');

  await testAsync('loads all .cap directories from a root folder', async () => {
    // Create a clean test directory with only valid caps
    const testRoot = path.resolve(FIXTURES_DIR, 'scan-test');
    const cap1Dir = path.resolve(testRoot, 'cap-a.cap');
    const cap2Dir = path.resolve(testRoot, 'cap-b.cap');

    // Clean up if exists
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
    fs.mkdirSync(testRoot, { recursive: true });
    fs.mkdirSync(cap1Dir, { recursive: true });
    fs.mkdirSync(cap2Dir, { recursive: true });

    // Write cap-a.cap (using default export)
    fs.writeFileSync(path.resolve(cap1Dir, 'cap.ts'),
      `export default class { async actionA(i: any, c: any) { return {}; } }`
    );
    fs.writeFileSync(path.resolve(cap1Dir, 'cap.meta.ts'),
      `export default { name: 'cap-a' };`
    );

    // Write cap-b.cap (using default export)
    fs.writeFileSync(path.resolve(cap2Dir, 'cap.ts'),
      `export default class { async actionB(i: any, c: any) { return {}; } }`
    );
    fs.writeFileSync(path.resolve(cap2Dir, 'cap.meta.ts'),
      `export default { name: 'cap-b' };`
    );

    // Also write a non-cap file (should be ignored)
    fs.writeFileSync(path.resolve(testRoot, 'readme.md'), '# Hello');

    const caps = await loadCapsFromDirectory(testRoot);
    assert.equal(caps.length, 2, `Should load 2 caps, got ${caps.length}`);
    const names = caps.map(c => c.meta.name).sort();
    assert.deepStrictEqual(names, ['cap-a', 'cap-b']);

    // Clean up
    fs.rmSync(testRoot, { recursive: true });
  })();

  await testAsync('returns empty array for non-existent directory', async () => {
    const caps = await loadCapsFromDirectory('/nonexistent/path');
    assert.equal(caps.length, 0);
  })();

  await testAsync('aggregates errors from broken caps', async () => {
    const testRoot = path.resolve(FIXTURES_DIR, 'scan-error-test');
    const brokenDir = path.resolve(testRoot, 'broken.cap');

    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
    fs.mkdirSync(testRoot, { recursive: true });
    fs.mkdirSync(brokenDir, { recursive: true });

    // Only cap.meta.ts, no cap.ts
    fs.writeFileSync(path.resolve(brokenDir, 'cap.meta.ts'),
      `export default { name: 'broken' };`
    );

    await assert.rejects(
      () => loadCapsFromDirectory(testRoot),
      CapLoadError
    );

    // Clean up
    fs.rmSync(testRoot, { recursive: true });
  })();

  // ── validateCapsuleRegistry ──────────────────────────────────

  console.log('\n📦 validateCapsuleRegistry');

  test('accepts valid registry with single cap', () => {
    class TestCap { async doStuff(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'test-capsule',
      caps: [
        { class: TestCap, meta: { name: 'test-cap' } },
      ],
    };
    const result = validateCapsuleRegistry(registry, '/path');
    assert.equal(result.name, 'test-capsule');
    assert.equal(result.caps.length, 1);
  });

  test('accepts valid registry with multiple caps', () => {
    class CapA { async a(i: any, c: any) { return {}; } }
    class CapB { async b(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'multi',
      caps: [
        { class: CapA, meta: { name: 'cap-a' } },
        { class: CapB, meta: { name: 'cap-b' } },
      ],
    };
    const result = validateCapsuleRegistry(registry, '/path');
    assert.equal(result.caps.length, 2);
  });

  test('rejects null registry', () => {
    assert.throws(() => validateCapsuleRegistry(null, '/path'), CapLoadError);
  });

  test('rejects missing name', () => {
    class TestCap { async doStuff(i: any, c: any) { return {}; } }
    assert.throws(
      () => validateCapsuleRegistry({ name: '', caps: [{ class: TestCap, meta: { name: 'x' } }] }, '/path'),
      CapLoadError
    );
  });

  test('rejects invalid name format', () => {
    class TestCap { async doStuff(i: any, c: any) { return {}; } }
    assert.throws(
      () => validateCapsuleRegistry({ name: 'bad name!', caps: [{ class: TestCap, meta: { name: 'x' } }] }, '/path'),
      CapLoadError
    );
  });

  test('rejects missing caps array', () => {
    assert.throws(
      () => validateCapsuleRegistry({ name: 'test' }, '/path'),
      CapLoadError
    );
  });

  test('rejects empty caps array', () => {
    assert.throws(
      () => validateCapsuleRegistry({ name: 'test', caps: [] }, '/path'),
      CapLoadError
    );
  });

  test('rejects cap with non-function class', () => {
    assert.throws(
      () => validateCapsuleRegistry({ name: 'test', caps: [{ class: 'not a class', meta: { name: 'x' } }] }, '/path'),
      CapLoadError
    );
  });

  test('rejects cap with missing meta', () => {
    class TestCap { async doStuff(i: any, c: any) { return {}; } }
    assert.throws(
      () => validateCapsuleRegistry({ name: 'test', caps: [{ class: TestCap }] }, '/path'),
      CapLoadError
    );
  });

  // ── convertRegistryToManifest ────────────────────────────────

  console.log('\n📦 convertRegistryToManifest');

  class RegistryCalcCap {
    async sum(input: any, ctx: any) { return { r: 1 }; }
    async mul(input: any, ctx: any) { return { r: 2 }; }
  }

  test('creates manifest with correct capsule name', () => {
    const registry: CapsuleRegistry = {
      name: 'calculator',
      caps: [
        { class: RegistryCalcCap, meta: { name: 'calc' } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    assert.equal(manifest.name, 'calculator');
  });

  test('includes all actions from cap class methods', () => {
    const registry: CapsuleRegistry = {
      name: 'calculator',
      caps: [
        { class: RegistryCalcCap, meta: { name: 'calc' } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    assert.ok(manifest.actions.sum, 'sum action should exist');
    assert.ok(manifest.actions.mul, 'mul action should exist');
    assert.equal(typeof manifest.actions.sum.handler, 'function');
  });

  test('merges routes from multiple caps', () => {
    class CapA { async a(i: any, c: any) { return {}; } }
    class CapB { async b(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'combo',
      caps: [
        {
          class: CapA,
          meta: {
            name: 'cap-a',
            routes: [{ method: 'GET', path: '/a', action: 'a' }],
          },
        },
        {
          class: CapB,
          meta: {
            name: 'cap-b',
            routes: [{ method: 'POST', path: '/b', action: 'b' }],
          },
        },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    const routes = (manifest as any).routes;
    assert.ok(routes, 'routes should exist');
    assert.equal(routes.length, 2);
    assert.equal(routes[0].path, '/a');
    assert.equal(routes[1].path, '/b');
  });

  test('merges event publishes from multiple caps (deduplicated)', () => {
    class CapA { async a(i: any, c: any) { return {}; } }
    class CapB { async b(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'combo',
      caps: [
        {
          class: CapA,
          meta: {
            name: 'cap-a',
            events: { publishes: ['shared.event', 'a.event'] },
          },
        },
        {
          class: CapB,
          meta: {
            name: 'cap-b',
            events: { publishes: ['shared.event', 'b.event'] },
          },
        },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    assert.ok(manifest.events, 'events should exist');
    assert.ok(manifest.events!.publishes, 'publishes should exist');
    const pubs = manifest.events!.publishes!;
    assert.equal(pubs.length, 3, `Expected 3 unique publishes, got ${pubs.length}: ${pubs.join(', ')}`);
    assert.ok(pubs.includes('shared.event'));
    assert.ok(pubs.includes('a.event'));
    assert.ok(pubs.includes('b.event'));
  });

  test('merges event subscribes from multiple caps', () => {
    class CapA { async handleX(i: any, c: any) { return {}; } }
    class CapB { async handleY(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'combo',
      caps: [
        {
          class: CapA,
          meta: {
            name: 'cap-a',
            events: { subscribes: [{ event: 'x.happened', action: 'handleX' }] },
          },
        },
        {
          class: CapB,
          meta: {
            name: 'cap-b',
            events: { subscribes: [{ event: 'y.happened', action: 'handleY' }] },
          },
        },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    assert.ok(manifest.events, 'events should exist');
    assert.ok(manifest.events!.subscribes, 'subscribes should exist');
    assert.equal(manifest.events!.subscribes!.length, 2);
  });

  test('merges dependencies from multiple caps (union)', () => {
    class CapA { async a(i: any, c: any) { return {}; } }
    class CapB { async b(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'combo',
      caps: [
        { class: CapA, meta: { name: 'cap-a', dependencies: ['db', 'cache'] } },
        { class: CapB, meta: { name: 'cap-b', dependencies: ['cache', 'queue'] } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);
    assert.ok(manifest.requires, 'requires should exist');
    assert.deepStrictEqual(
      [...manifest.requires!].sort(),
      ['cache', 'db', 'queue'],
    );
  });

  test('throws for registry with no action methods', () => {
    class EmptyCap { constructor() {} }
    const registry: CapsuleRegistry = {
      name: 'empty',
      caps: [
        { class: EmptyCap, meta: { name: 'empty-cap' } },
      ],
    };
    assert.throws(
      () => convertRegistryToManifest(registry),
      CapLoadError
    );
  });

  // ── convertRegistriesToManifests ─────────────────────────────

  console.log('\n📦 convertRegistriesToManifests');

  test('converts multiple registries', () => {
    class CapA { async a(i: any, c: any) { return {}; } }
    class CapB { async b(i: any, c: any) { return {}; } }
    const registries: CapsuleRegistry[] = [
      { name: 'first', caps: [{ class: CapA, meta: { name: 'a' } }] },
      { name: 'second', caps: [{ class: CapB, meta: { name: 'b' } }] },
    ];
    const manifests = convertRegistriesToManifests(registries);
    assert.equal(manifests.length, 2);
    assert.equal(manifests[0].name, 'first');
    assert.equal(manifests[1].name, 'second');
  });

  // ── loadCapsRegistry (integration) ───────────────────────────

  console.log('\n📦 loadCapsRegistry (integration)');

  await testAsync('loads valid caps.ts from a directory', async () => {
    const dir = path.resolve(FIXTURES_DIR, 'registry-single');
    const registry = await loadCapsRegistry(dir);
    assert.ok(registry, 'Should return a CapsuleRegistry');
    assert.equal(registry!.name, 'greeter');
    assert.equal(registry!.caps.length, 1);
    assert.equal(registry!.caps[0].meta.name, 'greet');
  })();

  await testAsync('loads caps.ts with multiple caps', async () => {
    const dir = path.resolve(FIXTURES_DIR, 'registry-multi');
    const registry = await loadCapsRegistry(dir);
    assert.ok(registry, 'Should return a CapsuleRegistry');
    assert.equal(registry!.name, 'utils');
    assert.equal(registry!.caps.length, 2);
    assert.equal(registry!.caps[0].meta.name, 'math');
    assert.equal(registry!.caps[1].meta.name, 'string');
  })();

  await testAsync('returns null when caps.ts is absent (fallback)', async () => {
    const dir = path.resolve(FIXTURES_DIR, 'registry-empty');
    const registry = await loadCapsRegistry(dir);
    assert.equal(registry, null, 'Should return null for directory without caps.ts');
  })();

  await testAsync('returns null for non-existent directory', async () => {
    const registry = await loadCapsRegistry('/nonexistent/path');
    assert.equal(registry, null);
  })();

  await testAsync('throws CapLoadError for invalid caps.ts', async () => {
    const dir = path.resolve(FIXTURES_DIR, 'registry-invalid');
    await assert.rejects(
      () => loadCapsRegistry(dir),
      CapLoadError
    );
  })();

  // ── loadCapsRegistriesFromDirectory ──────────────────────────

  console.log('\n📦 loadCapsRegistriesFromDirectory (integration)');

  await testAsync('loads registries from directories with caps.ts', async () => {
    const testRoot = path.resolve(FIXTURES_DIR, 'scan-registry-test');
    const dirA = path.resolve(testRoot, 'module-a');
    const dirB = path.resolve(testRoot, 'module-b');

    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
    fs.mkdirSync(testRoot, { recursive: true });
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });

    fs.writeFileSync(path.resolve(dirA, 'caps.ts'),
      `export default { name: 'module-a', caps: [{ class: class { async fa(i: any, c: any) { return {}; } }, meta: { name: 'a' } }] };`
    );
    fs.writeFileSync(path.resolve(dirB, 'caps.ts'),
      `export default { name: 'module-b', caps: [{ class: class { async fb(i: any, c: any) { return {}; } }, meta: { name: 'b' } }] };`
    );
    fs.writeFileSync(path.resolve(testRoot, 'readme.md'), '# Hello');

    const registries = await loadCapsRegistriesFromDirectory(testRoot);
    assert.equal(registries.length, 2, `Should load 2 registries, got ${registries.length}`);
    const names = registries.map(r => r.name).sort();
    assert.deepStrictEqual(names, ['module-a', 'module-b']);

    fs.rmSync(testRoot, { recursive: true });
  })();

  await testAsync('returns empty array for non-existent directory', async () => {
    const registries = await loadCapsRegistriesFromDirectory('/nonexistent/path');
    assert.equal(registries.length, 0);
  })();

  await testAsync('skips directories without caps.ts', async () => {
    const testRoot = path.resolve(FIXTURES_DIR, 'scan-skip-test');
    const dirA = path.resolve(testRoot, 'module-a');
    const dirB = path.resolve(testRoot, 'module-b');
    const dirNoCaps = path.resolve(testRoot, 'no-caps');

    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
    fs.mkdirSync(testRoot, { recursive: true });
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.mkdirSync(dirNoCaps, { recursive: true });

    fs.writeFileSync(path.resolve(dirA, 'caps.ts'),
      `export default { name: 'skip-a', caps: [{ class: class { async fa(i: any, c: any) { return {}; } }, meta: { name: 'a' } }] };`
    );
    fs.writeFileSync(path.resolve(dirB, 'caps.ts'),
      `export default { name: 'skip-b', caps: [{ class: class { async fb(i: any, c: any) { return {}; } }, meta: { name: 'b' } }] };`
    );
    // dirNoCaps has no caps.ts — should be silently skipped

    const registries = await loadCapsRegistriesFromDirectory(testRoot);
    assert.equal(registries.length, 2, `Should load 2 registries, got ${registries.length}`);
    const names = registries.map(r => r.name).sort();
    assert.deepStrictEqual(names, ['skip-a', 'skip-b']);

    fs.rmSync(testRoot, { recursive: true });
  })();

  // ── Duplicate Cap Names Detection ────────────────────────────

  console.log('\n🔍 Duplicate Cap Names Detection');

  test('detectDuplicateCapNames returns empty for unique names', () => {
    const metas: CapMeta[] = [
      { name: 'cap-a' },
      { name: 'cap-b' },
      { name: 'cap-c' },
    ];
    const result = detectDuplicateCapNames(metas);
    assert.deepStrictEqual(result, []);
  });

  test('detectDuplicateCapNames finds duplicate names', () => {
    const metas: CapMeta[] = [
      { name: 'cap-a' },
      { name: 'cap-b' },
      { name: 'cap-a' },
      { name: 'cap-c' },
      { name: 'cap-b' },
    ];
    const result = detectDuplicateCapNames(metas);
    assert.equal(result.length, 2);
    assert.ok(result.includes('cap-a'));
    assert.ok(result.includes('cap-b'));
  });

  test('validateCapsuleRegistry rejects duplicate cap names', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'test-dup',
      caps: [
        { class: CapA, meta: { name: 'duplicate' } },
        { class: CapB, meta: { name: 'duplicate' } },
      ],
    };
    assert.throws(
      () => validateCapsuleRegistry(registry, '/path'),
      DuplicateCapNameError
    );
  });

  test('DuplicateCapNameError includes duplicate names array', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'test-dup',
      caps: [
        { class: CapA, meta: { name: 'dup-name' } },
        { class: CapB, meta: { name: 'dup-name' } },
      ],
    };
    try {
      validateCapsuleRegistry(registry, '/path');
      throw new Error('should have thrown');
    } catch (err: any) {
      assert.ok(err instanceof DuplicateCapNameError);
      assert.deepStrictEqual(err.duplicates, ['dup-name']);
      assert.ok(err.message.includes('dup-name'));
    }
  });

  test('loadCapsFromDirectory detects duplicate cap names', async () => {
    const testRoot = path.resolve(FIXTURES_DIR, 'dup-cap-test');
    const cap1Dir = path.resolve(testRoot, 'cap1.cap');
    const cap2Dir = path.resolve(testRoot, 'cap2.cap');

    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
    fs.mkdirSync(testRoot, { recursive: true });
    fs.mkdirSync(cap1Dir, { recursive: true });
    fs.mkdirSync(cap2Dir, { recursive: true });

    // Both caps have the same meta name
    fs.writeFileSync(path.resolve(cap1Dir, 'cap.meta.ts'),
      `export default { name: 'same-name' };`
    );
    fs.writeFileSync(path.resolve(cap1Dir, 'cap.ts'),
      `export default class { async actionA(i: any, c: any) { return {}; } }`
    );
    fs.writeFileSync(path.resolve(cap2Dir, 'cap.meta.ts'),
      `export default { name: 'same-name' };`
    );
    fs.writeFileSync(path.resolve(cap2Dir, 'cap.ts'),
      `export default class { async actionB(i: any, c: any) { return {}; } }`
    );

    await assert.rejects(
      () => loadCapsFromDirectory(testRoot),
      DuplicateCapNameError
    );

    fs.rmSync(testRoot, { recursive: true });
  });

  // ── Dependency Cycle Detection ───────────────────────────────

  console.log('\n🔗 Dependency Cycle Detection');

  test('detectCapCycle returns null for acyclic deps', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    class CapC { async fc(i: any, c: any) { return {}; } }
    const caps: CapDefinition[] = [
      { class: CapA, meta: { name: 'a', dependencies: ['b'] } },
      { class: CapB, meta: { name: 'b', dependencies: ['c'] } },
      { class: CapC, meta: { name: 'c' } },
    ];
    const cycle = detectCapCycle(caps);
    assert.equal(cycle, null);
  });

  test('detectCapCycle finds simple cycle (a → b → a)', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    const caps: CapDefinition[] = [
      { class: CapA, meta: { name: 'a', dependencies: ['b'] } },
      { class: CapB, meta: { name: 'b', dependencies: ['a'] } },
    ];
    const cycle = detectCapCycle(caps);
    assert.ok(cycle, 'should detect cycle');
    assert.ok(cycle!.includes('a'));
    assert.ok(cycle!.includes('b'));
  });

  test('detectCapCycle finds three-node cycle (a → b → c → a)', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    class CapC { async fc(i: any, c: any) { return {}; } }
    const caps: CapDefinition[] = [
      { class: CapA, meta: { name: 'a', dependencies: ['b'] } },
      { class: CapB, meta: { name: 'b', dependencies: ['c'] } },
      { class: CapC, meta: { name: 'c', dependencies: ['a'] } },
    ];
    const cycle = detectCapCycle(caps);
    assert.ok(cycle, 'should detect cycle');
    assert.ok(cycle!.includes('a'));
    assert.ok(cycle!.includes('b'));
    assert.ok(cycle!.includes('c'));
  });

  test('detectCapCycle ignores external dependencies', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    const caps: CapDefinition[] = [
      { class: CapA, meta: { name: 'a', dependencies: ['db', 'redis', 'b'] } },
      { class: CapB, meta: { name: 'b', dependencies: ['queue'] } },
    ];
    const cycle = detectCapCycle(caps);
    assert.equal(cycle, null); // db, redis, queue are external, no cycle
  });

  test('validateCapsuleRegistry rejects caps with dependency cycles', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'cyclic-capsule',
      caps: [
        { class: CapA, meta: { name: 'a', dependencies: ['b'] } },
        { class: CapB, meta: { name: 'b', dependencies: ['a'] } },
      ],
    };
    assert.throws(
      () => validateCapsuleRegistry(registry, '/path'),
      CapCycleError
    );
  });

  test('CapCycleError includes cycle path', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    const registry: CapsuleRegistry = {
      name: 'cyclic-capsule',
      caps: [
        { class: CapA, meta: { name: 'x', dependencies: ['y'] } },
        { class: CapB, meta: { name: 'y', dependencies: ['x'] } },
      ],
    };
    try {
      validateCapsuleRegistry(registry, '/path');
      throw new Error('should have thrown');
    } catch (err: any) {
      assert.ok(err instanceof CapCycleError);
      assert.ok(err.cycle.includes('x'));
      assert.ok(err.cycle.includes('y'));
      assert.ok(err.message.includes('x'));
      assert.ok(err.message.includes('y'));
    }
  });

  // ── Duplicate Registry Names Detection ──────────────────────

  console.log('\n📋 Duplicate Registry Names Detection');

  test('detectDuplicateRegistryNames finds duplicates', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    const registries: CapsuleRegistry[] = [
      { name: 'dup-registry', caps: [{ class: CapA, meta: { name: 'a' } }] },
      { name: 'unique-registry', caps: [{ class: CapB, meta: { name: 'b' } }] },
      { name: 'dup-registry', caps: [{ class: CapA, meta: { name: 'c' } }] },
    ];
    const result = detectDuplicateRegistryNames(registries);
    assert.equal(result.length, 1);
    assert.ok(result.includes('dup-registry'));
  });

  test('detectDuplicateRegistryNames returns empty for unique names', () => {
    class CapA { async fa(i: any, c: any) { return {}; } }
    class CapB { async fb(i: any, c: any) { return {}; } }
    const registries: CapsuleRegistry[] = [
      { name: 'reg-a', caps: [{ class: CapA, meta: { name: 'a' } }] },
      { name: 'reg-b', caps: [{ class: CapB, meta: { name: 'b' } }] },
    ];
    const result = detectDuplicateRegistryNames(registries);
    assert.deepStrictEqual(result, []);
  });

  await testAsync('loadCapsRegistriesFromDirectory detects duplicate registry names', async () => {
    const testRoot = path.resolve(FIXTURES_DIR, 'dup-reg-test');
    const dirA = path.resolve(testRoot, 'module-a');
    const dirB = path.resolve(testRoot, 'module-b');

    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
    fs.mkdirSync(testRoot, { recursive: true });
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });

    fs.writeFileSync(path.resolve(dirA, 'caps.ts'),
      `export default { name: 'same-registry', caps: [{ class: class { async fa(i: any, c: any) { return {}; } }, meta: { name: 'a' } }] };`
    );
    fs.writeFileSync(path.resolve(dirB, 'caps.ts'),
      `export default { name: 'same-registry', caps: [{ class: class { async fb(i: any, c: any) { return {}; } }, meta: { name: 'b' } }] };`
    );

    await assert.rejects(
      () => loadCapsRegistriesFromDirectory(testRoot),
      DuplicateCapNameError
    );

    fs.rmSync(testRoot, { recursive: true });
  })();

  // ── Summary ──────────────────────────────────────────────────

  console.log('\n' + '='.repeat(50));
  console.log(`Test Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    process.exit(1);
  }
})();
