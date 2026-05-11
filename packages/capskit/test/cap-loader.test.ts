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
  CapLoadError,
} from '../src/kernel/cap-loader';
import type { CapMeta, CapDefinition } from '../src/types';

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

  // ── Summary ──────────────────────────────────────────────────

  console.log('\n' + '='.repeat(50));
  console.log(`Test Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    process.exit(1);
  }
})();
