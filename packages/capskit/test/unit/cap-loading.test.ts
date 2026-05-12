/**
 * Comprehensive Cap Loading Test Suite
 *
 * Tests the complete cap manifest loading and validation pipeline:
 * 1. Basic manifest loading & conversion
 * 2. Missing fields detection
 * 3. Dependency validation
 * 4. Action schema validation
 * 5. Event validation
 * 6. Caps registry loading
 * 7. Validation errors
 * 8. Edge cases
 *
 * All tests are fast, synchronous (where possible), and independent.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  // Validation
  validateCapMeta,
  validateCapClass,
  validateCapsuleRegistry,
  // Loading
  loadCapFromDir,
  loadCapsFromDirectory,
  loadCapsRegistry,
  loadCapsRegistriesFromDirectory,
  // Conversion
  convertCapToManifest,
  convertCapsToManifests,
  convertRegistryToManifest,
  convertRegistriesToManifests,
  // Detection
  detectDuplicateCapNames,
  detectDuplicateRegistryNames,
  detectCapCycle,
  // Errors
  CapLoadError,
  DuplicateCapNameError,
  CapCycleError,
} from '../../src/kernel/cap-loader';
import type {
  CapMeta,
  CapDefinition,
  CapsuleRegistry,
  CapsuleManifest,
  CapEventSubscription,
  CapRoute,
} from '../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'cap-loader-fixtures');

// ---------------------------------------------------------------------------
// Test runner helpers
// ---------------------------------------------------------------------------

let totalPassed = 0;
let totalFailed = 0;
let currentSuite = '';

interface TestResult {
  name: string;
  suite: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    totalPassed++;
    results.push({ name, suite: currentSuite, passed: true });
    console.log(`    ✅ ${name}`);
  } catch (e: any) {
    totalFailed++;
    results.push({ name, suite: currentSuite, passed: false, error: e.message });
    console.log(`    ❌ ${name}`);
    console.log(`       ${e.message}`);
  }
}

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    totalPassed++;
    results.push({ name, suite: currentSuite, passed: true });
    console.log(`    ✅ ${name}`);
  } catch (e: any) {
    totalFailed++;
    results.push({ name, suite: currentSuite, passed: false, error: e.message });
    console.log(`    ❌ ${name}`);
    console.log(`       ${e.message}`);
  }
}

function suite(name: string) {
  currentSuite = name;
  console.log(`\n  📦 ${name}`);
}

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

/** Create a temp directory with cap files, returns cleanup function */
function createTempCapDir(
  rootName: string,
  capName: string,
  capContent: string,
  metaContent: string,
): { dirPath: string; cleanup: () => void } {
  const testRoot = path.resolve(FIXTURES_DIR, `tmp-${rootName}`);
  const capDir = path.resolve(testRoot, `${capName}.cap`);

  // Clean up if exists
  if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
  fs.mkdirSync(capDir, { recursive: true });
  fs.writeFileSync(path.resolve(capDir, 'cap.ts'), capContent);
  fs.writeFileSync(path.resolve(capDir, 'cap.meta.ts'), metaContent);

  return {
    dirPath: capDir,
    cleanup: () => {
      if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
    },
  };
}

/** Create a temp directory with a caps.ts registry file */
function createTempRegistryDir(
  rootName: string,
  registryContent: string,
): { dirPath: string; cleanup: () => void } {
  const testRoot = path.resolve(FIXTURES_DIR, `tmp-registry-${rootName}`);
  fs.mkdirSync(testRoot, { recursive: true });
  fs.writeFileSync(path.resolve(testRoot, 'caps.ts'), registryContent);

  return {
    dirPath: testRoot,
    cleanup: () => {
      if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
    },
  };
}

// ===================================================================
// 1. BASIC MANIFEST LOADING & CONVERSION
// ===================================================================

suite('1. Basic Manifest Loading & Conversion');

test('convertCapToManifest creates manifest with correct structure', () => {
  class TestCap {
    async action(input: any, ctx: any) { return { ok: true }; }
  }
  const def: CapDefinition = { class: TestCap, meta: { name: 'test' } };
  const manifest = convertCapToManifest(def);

  assert.ok(manifest, 'manifest should not be null');
  assert.equal(manifest.name, 'test');
  assert.ok(manifest.actions, 'should have actions');
  assert.ok(manifest.actions.action, 'should have action handler');
  assert.equal(typeof manifest.actions.action.handler, 'function');
});

test('convertCapToManifest uses custom capsuleName override', () => {
  class TestCap {
    async action(input: any, ctx: any) { return { ok: true }; }
  }
  const def: CapDefinition = { class: TestCap, meta: { name: 'original' } };
  const manifest = convertCapToManifest(def, 'override-name');
  assert.equal(manifest.name, 'override-name');
});

test('convertCapToManifest maps all cap methods as actions', () => {
  class MultiActionCap {
    async first(input: any, ctx: any) { return 1; }
    async second(input: any, ctx: any) { return 2; }
    async third(input: any, ctx: any) { return 3; }
  }
  const def: CapDefinition = { class: MultiActionCap, meta: { name: 'multi' } };
  const manifest = convertCapToManifest(def);

  assert.ok(manifest.actions.first);
  assert.ok(manifest.actions.second);
  assert.ok(manifest.actions.third);
  assert.equal(Object.keys(manifest.actions).length, 3);
});

test('convertCapsToManifests converts array of caps', () => {
  class CapA { async a(i: any, c: any) { return {}; } }
  class CapB { async b(i: any, c: any) { return {}; } }
  const defs: CapDefinition[] = [
    { class: CapA, meta: { name: 'a' } },
    { class: CapB, meta: { name: 'b', dependencies: ['db'] } },
  ];
  const manifests = convertCapsToManifests(defs);
  assert.equal(manifests.length, 2);
  assert.equal(manifests[0].name, 'a');
  assert.equal(manifests[1].name, 'b');
  assert.deepStrictEqual(manifests[1].requires, ['db']);
});

test('convertRegistryToManifest creates manifest from registry', () => {
  class Cap { async act(i: any, c: any) { return {}; } }
  const registry: CapsuleRegistry = {
    name: 'test-capsule',
    caps: [{ class: Cap, meta: { name: 'test-cap' } }],
  };
  const manifest = convertRegistryToManifest(registry);
  assert.equal(manifest.name, 'test-capsule');
  assert.ok(manifest.actions.act);
});

test('convertRegistriesToManifests converts array of registries', () => {
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

test('convertRegistryToManifest merges actions from multiple caps', () => {
  class CapA { async actionA(i: any, c: any) { return {}; } }
  class CapB { async actionB(i: any, c: any) { return {}; } }
  const registry: CapsuleRegistry = {
    name: 'merged',
    caps: [
      { class: CapA, meta: { name: 'a' } },
      { class: CapB, meta: { name: 'b' } },
    ],
  };
  const manifest = convertRegistryToManifest(registry);
  assert.ok(manifest.actions.actionA);
  assert.ok(manifest.actions.actionB);
  assert.equal(Object.keys(manifest.actions).length, 2);
});

// ===================================================================
// 2. MISSING FIELDS DETECTION
// ===================================================================

suite('2. Missing Fields Detection');

test('validateCapMeta rejects null', () => {
  assert.throws(
    () => validateCapMeta(null, '/path'),
    CapLoadError,
    'should throw for null meta',
  );
});

test('validateCapMeta rejects undefined', () => {
  assert.throws(
    () => validateCapMeta(undefined, '/path'),
    CapLoadError,
    'should throw for undefined meta',
  );
});

test('validateCapMeta rejects non-object (string)', () => {
  assert.throws(
    () => validateCapMeta('not-an-object', '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects non-object (number)', () => {
  assert.throws(
    () => validateCapMeta(42, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects missing name', () => {
  assert.throws(
    () => validateCapMeta({}, '/path'),
    CapLoadError,
    'should throw for missing name',
  );
});

test('validateCapMeta rejects empty name', () => {
  assert.throws(
    () => validateCapMeta({ name: '' }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects whitespace-only name', () => {
  assert.throws(
    () => validateCapMeta({ name: '   ' }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects name with spaces', () => {
  assert.throws(
    () => validateCapMeta({ name: 'hello world' }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects name with special chars', () => {
  assert.throws(
    () => validateCapMeta({ name: 'test@cap!' }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta accepts name with underscores', () => {
  const result = validateCapMeta({ name: 'my_cap_name' }, '/path');
  assert.equal(result.name, 'my_cap_name');
});

test('validateCapMeta accepts name with dashes', () => {
  const result = validateCapMeta({ name: 'my-cap-name' }, '/path');
  assert.equal(result.name, 'my-cap-name');
});

test('validateCapMeta accepts name with numbers', () => {
  const result = validateCapMeta({ name: 'cap2024' }, '/path');
  assert.equal(result.name, 'cap2024');
});

test('validateCapMeta rejects non-array routes', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', routes: 'not-array' }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects routes with invalid method', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', routes: [{ method: 'INVALID', path: '/', action: 'a' }] }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects routes with empty path', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', routes: [{ method: 'GET', path: '', action: 'a' }] }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects routes with missing action', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', routes: [{ method: 'GET', path: '/', action: '' }] }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta accepts all valid HTTP methods', () => {
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  for (const method of methods) {
    const meta = { name: 'x', routes: [{ method, path: '/', action: 'a' }] };
    const result = validateCapMeta(meta, '/path');
    assert.equal(result.routes![0].method, method);
  }
});

test('validateCapsuleRegistry rejects null registry', () => {
  assert.throws(
    () => validateCapsuleRegistry(null, '/path'),
    CapLoadError,
  );
});

test('validateCapsuleRegistry rejects undefined registry', () => {
  assert.throws(
    () => validateCapsuleRegistry(undefined, '/path'),
    CapLoadError,
  );
});

test('validateCapsuleRegistry rejects missing caps array', () => {
  assert.throws(
    () => validateCapsuleRegistry({ name: 'test' } as any, '/path'),
    CapLoadError,
  );
});

test('validateCapsuleRegistry rejects empty caps array', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  assert.throws(
    () => validateCapsuleRegistry({ name: 'test', caps: [] }, '/path'),
    CapLoadError,
  );
});

test('validateCapsuleRegistry rejects cap with missing class', () => {
  assert.throws(
    () => validateCapsuleRegistry({ name: 'test', caps: [{ meta: { name: 'x' } }] } as any, '/path'),
    CapLoadError,
  );
});

test('validateCapsuleRegistry rejects cap with missing meta', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  assert.throws(
    () => validateCapsuleRegistry({ name: 'test', caps: [{ class: Cap }] } as any, '/path'),
    CapLoadError,
  );
});

test('validateCapsuleRegistry rejects cap with non-function class', () => {
  assert.throws(
    () => validateCapsuleRegistry({ name: 'test', caps: [{ class: 'not-a-class', meta: { name: 'x' } }] } as any, '/path'),
    CapLoadError,
  );
});

test('validateCapsuleRegistry rejects cap with non-object meta', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  assert.throws(
    () => validateCapsuleRegistry({ name: 'test', caps: [{ class: Cap, meta: 'bad' }] } as any, '/path'),
    CapLoadError,
  );
});

// ===================================================================
// 3. DEPENDENCY VALIDATION
// ===================================================================

suite('3. Dependency Validation');

test('validateCapMeta accepts empty dependencies array', () => {
  const result = validateCapMeta({ name: 'x', dependencies: [] }, '/path');
  assert.deepStrictEqual(result.dependencies, []);
});

test('validateCapMeta accepts valid dependencies array', () => {
  const result = validateCapMeta({ name: 'x', dependencies: ['db', 'cache', 'queue'] }, '/path');
  assert.deepStrictEqual(result.dependencies, ['db', 'cache', 'queue']);
});

test('validateCapMeta rejects non-array dependencies', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', dependencies: 'not-array' }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects empty string in dependencies', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', dependencies: [''] }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects non-string in dependencies', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', dependencies: [42] }, '/path'),
    CapLoadError,
  );
});

test('convertCapToManifest maps dependencies to requires', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  const def: CapDefinition = {
    class: Cap,
    meta: { name: 'x', dependencies: ['database', 'redis'] },
  };
  const manifest = convertCapToManifest(def);
  assert.deepStrictEqual(manifest.requires, ['database', 'redis']);
});

test('convertCapToManifest omits requires when no dependencies', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  const def: CapDefinition = { class: Cap, meta: { name: 'x' } };
  const manifest = convertCapToManifest(def);
  assert.equal(manifest.requires, undefined);
});

test('convertRegistryToManifest merges dependencies as union', () => {
  class CapA { async a(i: any, c: any) { return {}; } }
  class CapB { async b(i: any, c: any) { return {}; } }
  const registry: CapsuleRegistry = {
    name: 'combo',
    caps: [
      { class: CapA, meta: { name: 'a', dependencies: ['db', 'cache'] } },
      { class: CapB, meta: { name: 'b', dependencies: ['cache', 'queue'] } },
    ],
  };
  const manifest = convertRegistryToManifest(registry);
  assert.ok(manifest.requires, 'requires should exist');
  const sorted = [...manifest.requires!].sort();
  assert.deepStrictEqual(sorted, ['cache', 'db', 'queue']);
});

test('detectCapCycle returns null for no dependencies', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  const caps: CapDefinition[] = [
    { class: Cap, meta: { name: 'a' } },
    { class: Cap, meta: { name: 'b' } },
  ];
  const cycle = detectCapCycle(caps);
  assert.equal(cycle, null);
});

test('detectCapCycle returns null for external-only dependencies', () => {
  class CapA { async a(i: any, c: any) { return {}; } }
  class CapB { async b(i: any, c: any) { return {}; } }
  const caps: CapDefinition[] = [
    { class: CapA, meta: { name: 'a', dependencies: ['database', 'redis'] } },
    { class: CapB, meta: { name: 'b', dependencies: ['queue'] } },
  ];
  const cycle = detectCapCycle(caps);
  assert.equal(cycle, null);
});

test('detectCapCycle finds simple cycle A → B → A', () => {
  class CapA { async a(i: any, c: any) { return {}; } }
  class CapB { async b(i: any, c: any) { return {}; } }
  const caps: CapDefinition[] = [
    { class: CapA, meta: { name: 'a', dependencies: ['b'] } },
    { class: CapB, meta: { name: 'b', dependencies: ['a'] } },
  ];
  const cycle = detectCapCycle(caps);
  assert.ok(cycle, 'should detect cycle');
  assert.ok(cycle!.includes('a'));
  assert.ok(cycle!.includes('b'));
});

test('detectCapCycle finds three-node cycle', () => {
  class Cap { async x(i: any, c: any) { return {}; } }
  const caps: CapDefinition[] = [
    { class: Cap, meta: { name: 'a', dependencies: ['b'] } },
    { class: Cap, meta: { name: 'b', dependencies: ['c'] } },
    { class: Cap, meta: { name: 'c', dependencies: ['a'] } },
  ];
  const cycle = detectCapCycle(caps);
  assert.ok(cycle);
  assert.ok(cycle!.includes('a'));
  assert.ok(cycle!.includes('b'));
  assert.ok(cycle!.includes('c'));
});

test('detectCapCycle returns null for linear chain', () => {
  class Cap { async x(i: any, c: any) { return {}; } }
  const caps: CapDefinition[] = [
    { class: Cap, meta: { name: 'a', dependencies: ['b'] } },
    { class: Cap, meta: { name: 'b', dependencies: ['c'] } },
    { class: Cap, meta: { name: 'c' } },
  ];
  const cycle = detectCapCycle(caps);
  assert.equal(cycle, null);
});

test('validateCapsuleRegistry rejects cycle with CapCycleError', () => {
  class CapA { async a(i: any, c: any) { return {}; } }
  class CapB { async b(i: any, c: any) { return {}; } }
  const registry: CapsuleRegistry = {
    name: 'cyclic',
    caps: [
      { class: CapA, meta: { name: 'a', dependencies: ['b'] } },
      { class: CapB, meta: { name: 'b', dependencies: ['a'] } },
    ],
  };
  assert.throws(
    () => validateCapsuleRegistry(registry, '/path'),
    CapCycleError,
  );
});

test('CapCycleError includes cycle path', () => {
  class CapA { async a(i: any, c: any) { return {}; } }
  class CapB { async b(i: any, c: any) { return {}; } }
  const registry: CapsuleRegistry = {
    name: 'cyclic',
    caps: [
      { class: CapA, meta: { name: 'x', dependencies: ['y'] } },
      { class: CapB, meta: { name: 'y', dependencies: ['x'] } },
    ],
  };
  try {
    validateCapsuleRegistry(registry, '/path');
    assert.fail('should have thrown');
  } catch (err: any) {
    assert.ok(err instanceof CapCycleError);
    assert.ok(err.cycle.includes('x'));
    assert.ok(err.cycle.includes('y'));
    assert.ok(err.message.includes('x'));
    assert.ok(err.message.includes('y'));
  }
});

// ===================================================================
// 4. ACTION SCHEMA VALIDATION
// ===================================================================

suite('4. Action Schema Validation');

test('validateCapClass accepts valid class with async methods', () => {
  class ValidCap {
    async action(input: any, ctx: any) { return { ok: true }; }
  }
  validateCapClass(ValidCap, '/path');
  // No error = success
});

test('validateCapClass rejects null export', () => {
  assert.throws(
    () => validateCapClass(null, '/path'),
    CapLoadError,
  );
});

test('validateCapClass rejects undefined export', () => {
  assert.throws(
    () => validateCapClass(undefined, '/path'),
    CapLoadError,
  );
});

test('validateCapClass rejects string export', () => {
  assert.throws(
    () => validateCapClass('not-a-class', '/path'),
    CapLoadError,
  );
});

test('validateCapClass rejects number export', () => {
  assert.throws(
    () => validateCapClass(42, '/path'),
    CapLoadError,
  );
});

test('validateCapClass rejects plain object export', () => {
  assert.throws(
    () => validateCapClass({ action: () => {} }, '/path'),
    CapLoadError,
  );
});

test('validateCapClass rejects arrow function export', () => {
  assert.throws(
    () => validateCapClass(() => {}, '/path'),
    CapLoadError,
  );
});

test('validateCapClass rejects class with no methods', () => {
  class EmptyCap {
    constructor() {}
  }
  assert.throws(
    () => validateCapClass(EmptyCap, '/path'),
    CapLoadError,
  );
});

test('validateCapClass accepts class with constructor and methods', () => {
  class CapWithConstructor {
    private value: number;
    constructor() { this.value = 42; }
    async action(input: any, ctx: any) { return { value: this.value }; }
  }
  validateCapClass(CapWithConstructor, '/path');
});

test('convertCapToManifest throws when cap has no action methods', () => {
  class EmptyCap {
    constructor() {}
  }
  const def: CapDefinition = { class: EmptyCap as any, meta: { name: 'empty' } };
  assert.throws(
    () => convertCapToManifest(def),
    CapLoadError,
  );
});

test('convertRegistryToManifest throws when registry has no action methods', () => {
  class EmptyCap {
    constructor() {}
  }
  const registry: CapsuleRegistry = {
    name: 'empty',
    caps: [{ class: EmptyCap as any, meta: { name: 'empty-cap' } }],
  };
  assert.throws(
    () => convertRegistryToManifest(registry),
    CapLoadError,
  );
});

// ===================================================================
// 5. EVENT VALIDATION
// ===================================================================

suite('5. Event Validation');

test('validateCapMeta accepts events with publishes only', () => {
  const result = validateCapMeta({
    name: 'x',
    events: { publishes: ['event.a', 'event.b'] },
  }, '/path');
  assert.deepStrictEqual(result.events!.publishes, ['event.a', 'event.b']);
});

test('validateCapMeta accepts events with subscribes only', () => {
  const result = validateCapMeta({
    name: 'x',
    events: { subscribes: [{ event: 'user.created', action: 'onCreate' }] },
  }, '/path');
  assert.equal(result.events!.subscribes!.length, 1);
});

test('validateCapMeta accepts events with both publishes and subscribes', () => {
  const result = validateCapMeta({
    name: 'x',
    events: {
      publishes: ['x.done'],
      subscribes: [{ event: 'y.triggered', action: 'handle' }],
    },
  }, '/path');
  assert.ok(result.events!.publishes);
  assert.ok(result.events!.subscribes);
});

test('validateCapMeta rejects events as array', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: [] as any }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects non-string in publishes', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { publishes: [42] } }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects empty string in publishes', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { publishes: [''] } }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects non-array publishes', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { publishes: 'bad' } }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects non-object subscribe entry', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { subscribes: ['bad'] as any } }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects subscribe with empty event name', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { subscribes: [{ event: '', action: 'a' }] } }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects subscribe with empty action name', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { subscribes: [{ event: 'x', action: '' }] } }, '/path'),
    CapLoadError,
  );
});

test('validateCapMeta rejects non-array subscribes', () => {
  assert.throws(
    () => validateCapMeta({ name: 'x', events: { subscribes: 'bad' } }, '/path'),
    CapLoadError,
  );
});

test('convertCapToManifest maps event publishes', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  const def: CapDefinition = {
    class: Cap,
    meta: { name: 'x', events: { publishes: ['event.a', 'event.b'] } },
  };
  const manifest = convertCapToManifest(def);
  assert.deepStrictEqual(manifest.events?.publishes, ['event.a', 'event.b']);
});

test('convertCapToManifest maps event subscribes', () => {
  class Cap { async handle(i: any, c: any) { return {}; } }
  const subs: CapEventSubscription[] = [
    { event: 'user.created', action: 'handle' },
  ];
  const def: CapDefinition = {
    class: Cap,
    meta: { name: 'x', events: { subscribes: subs } },
  };
  const manifest = convertCapToManifest(def);
  assert.deepStrictEqual(manifest.events?.subscribes, subs);
});

test('convertRegistryToManifest deduplicates event publishes', () => {
  class CapA { async a(i: any, c: any) { return {}; } }
  class CapB { async b(i: any, c: any) { return {}; } }
  const registry: CapsuleRegistry = {
    name: 'combo',
    caps: [
      { class: CapA, meta: { name: 'a', events: { publishes: ['shared', 'a.event'] } } },
      { class: CapB, meta: { name: 'b', events: { publishes: ['shared', 'b.event'] } } },
    ],
  };
  const manifest = convertRegistryToManifest(registry);
  const pubs = manifest.events!.publishes!;
  assert.equal(pubs.length, 3, `Expected 3 unique publishes, got ${pubs.length}`);
  assert.ok(pubs.includes('shared'));
  assert.ok(pubs.includes('a.event'));
  assert.ok(pubs.includes('b.event'));
});

test('convertRegistryToManifest merges event subscribes', () => {
  class CapA { async handleX(i: any, c: any) { return {}; } }
  class CapB { async handleY(i: any, c: any) { return {}; } }
  const registry: CapsuleRegistry = {
    name: 'combo',
    caps: [
      { class: CapA, meta: { name: 'a', events: { subscribes: [{ event: 'x', action: 'handleX' }] } } },
      { class: CapB, meta: { name: 'b', events: { subscribes: [{ event: 'y', action: 'handleY' }] } } },
    ],
  };
  const manifest = convertRegistryToManifest(registry);
  assert.equal(manifest.events!.subscribes!.length, 2);
});

// ===================================================================
// 6. CAPS REGISTRY LOADING
// ===================================================================

suite('6. Caps Registry Loading');

test('loadCapsRegistry returns null when no caps.ts file exists', async () => {
  const result = await loadCapsRegistry('/nonexistent/path');
  assert.equal(result, null);
});

test('loadCapsRegistry returns null for directory without caps.ts', async () => {
  const dir = path.resolve(FIXTURES_DIR, 'registry-empty');
  const result = await loadCapsRegistry(dir);
  assert.equal(result, null);
});

test('loadCapsRegistry loads valid single-cap registry', async () => {
  const dir = path.resolve(FIXTURES_DIR, 'registry-single');
  const registry = await loadCapsRegistry(dir);
  assert.ok(registry, 'should return registry');
  assert.equal(registry!.name, 'greeter');
  assert.equal(registry!.caps.length, 1);
  assert.equal(registry!.caps[0].meta.name, 'greet');
});

test('loadCapsRegistry loads multi-cap registry', async () => {
  const dir = path.resolve(FIXTURES_DIR, 'registry-multi');
  const registry = await loadCapsRegistry(dir);
  assert.ok(registry);
  assert.equal(registry!.name, 'utils');
  assert.equal(registry!.caps.length, 2);
  const names = registry!.caps.map(c => c.meta.name);
  assert.ok(names.includes('math'));
  assert.ok(names.includes('string'));
});

test('loadCapsRegistry throws for invalid caps.ts', async () => {
  const dir = path.resolve(FIXTURES_DIR, 'registry-invalid');
  await assert.rejects(
    () => loadCapsRegistry(dir),
    CapLoadError,
  );
});

test('loadCapsRegistriesFromDirectory returns empty for non-existent dir', async () => {
  const result = await loadCapsRegistriesFromDirectory('/nonexistent');
  assert.deepStrictEqual(result, []);
});

test('detectDuplicateRegistryNames finds duplicates', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  const registries: CapsuleRegistry[] = [
    { name: 'dup', caps: [{ class: Cap, meta: { name: 'a' } }] },
    { name: 'unique', caps: [{ class: Cap, meta: { name: 'b' } }] },
    { name: 'dup', caps: [{ class: Cap, meta: { name: 'c' } }] },
  ];
  const result = detectDuplicateRegistryNames(registries);
  assert.equal(result.length, 1);
  assert.ok(result.includes('dup'));
});

test('detectDuplicateRegistryNames returns empty for unique names', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  const registries: CapsuleRegistry[] = [
    { name: 'reg-a', caps: [{ class: Cap, meta: { name: 'a' } }] },
    { name: 'reg-b', caps: [{ class: Cap, meta: { name: 'b' } }] },
  ];
  const result = detectDuplicateRegistryNames(registries);
  assert.deepStrictEqual(result, []);
});

// ===================================================================
// 7. VALIDATION ERRORS
// ===================================================================

suite('7. Validation Errors');

test('CapLoadError has correct name property', () => {
  const err = new CapLoadError('test error');
  assert.equal(err.name, 'CapLoadError');
});

test('CapLoadError stores message correctly', () => {
  const err = new CapLoadError('my error message');
  assert.equal(err.message, 'my error message');
});

test('CapLoadError stores filePath when provided', () => {
  const err = new CapLoadError('test', '/some/path.ts');
  assert.equal(err.filePath, '/some/path.ts');
});

test('CapLoadError has no filePath when not provided', () => {
  const err = new CapLoadError('test');
  assert.equal(err.filePath, undefined);
});

test('DuplicateCapNameError extends CapLoadError', () => {
  const err = new DuplicateCapNameError(['dup-name'], 'test context');
  assert.ok(err instanceof CapLoadError);
});

test('DuplicateCapNameError stores duplicates array', () => {
  const err = new DuplicateCapNameError(['dup-a', 'dup-b'], 'test context');
  assert.deepStrictEqual(err.duplicates, ['dup-a', 'dup-b']);
});

test('DuplicateCapNameError message includes duplicate names', () => {
  const err = new DuplicateCapNameError(['my-cap'], 'capsule X');
  assert.ok(err.message.includes('my-cap'));
  assert.ok(err.message.includes('capsule X'));
});

test('CapCycleError extends CapLoadError', () => {
  const err = new CapCycleError(['a', 'b', 'a'], 'test context');
  assert.ok(err instanceof CapLoadError);
});

test('CapCycleError stores cycle array', () => {
  const err = new CapCycleError(['a', 'b', 'a'], 'test context');
  assert.deepStrictEqual(err.cycle, ['a', 'b', 'a']);
});

test('CapCycleError message includes cycle path', () => {
  const err = new CapCycleError(['a', 'b', 'a'], 'capsule X');
  assert.ok(err.message.includes('a'));
  assert.ok(err.message.includes('b'));
  assert.ok(err.message.includes('capsule X'));
});

test('DuplicateCapNameError thrown for duplicate cap names in registry', () => {
  class CapA { async a(i: any, c: any) { return {}; } }
  class CapB { async b(i: any, c: any) { return {}; } }
  const registry: CapsuleRegistry = {
    name: 'dup-test',
    caps: [
      { class: CapA, meta: { name: 'same-name' } },
      { class: CapB, meta: { name: 'same-name' } },
    ],
  };
  try {
    validateCapsuleRegistry(registry, '/path');
    assert.fail('should have thrown');
  } catch (err: any) {
    assert.ok(err instanceof DuplicateCapNameError);
    assert.deepStrictEqual(err.duplicates, ['same-name']);
  }
});

test('loadCapsFromDirectory throws DuplicateCapNameError for duplicates', async () => {
  const testRoot = path.resolve(FIXTURES_DIR, 'tmp-dup-load-test');
  const cap1Dir = path.resolve(testRoot, 'cap1.cap');
  const cap2Dir = path.resolve(testRoot, 'cap2.cap');

  if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
  fs.mkdirSync(cap1Dir, { recursive: true });
  fs.mkdirSync(cap2Dir, { recursive: true });

  fs.writeFileSync(path.resolve(cap1Dir, 'cap.ts'),
    `export default class { async actionA(i: any, c: any) { return {}; } }`);
  fs.writeFileSync(path.resolve(cap1Dir, 'cap.meta.ts'),
    `export default { name: 'same-name' };`);
  fs.writeFileSync(path.resolve(cap2Dir, 'cap.ts'),
    `export default class { async actionB(i: any, c: any) { return {}; } }`);
  fs.writeFileSync(path.resolve(cap2Dir, 'cap.meta.ts'),
    `export default { name: 'same-name' };`);

  try {
    await assert.rejects(
      () => loadCapsFromDirectory(testRoot),
      DuplicateCapNameError,
    );
  } finally {
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
  }
});

// ===================================================================
// 8. EDGE CASES
// ===================================================================

suite('8. Edge Cases');

test('loadCapFromDir returns null for non-cap directory', async () => {
  const result = await loadCapFromDir(FIXTURES_DIR);
  assert.equal(result, null);
});

test('loadCapsFromDirectory returns empty array for non-existent dir', async () => {
  const result = await loadCapsFromDirectory('/nonexistent/path');
  assert.deepStrictEqual(result, []);
});

test('loadCapsFromDirectory ignores non-.cap directories', async () => {
  const testRoot = path.resolve(FIXTURES_DIR, 'tmp-ignore-test');
  fs.mkdirSync(testRoot, { recursive: true });
  // Create a directory that doesn't end with .cap
  const nonCapDir = path.resolve(testRoot, 'not-a-cap');
  fs.mkdirSync(nonCapDir, { recursive: true });
  fs.writeFileSync(path.resolve(nonCapDir, 'cap.ts'),
    `export default class { async a(i: any, c: any) { return {}; } }`);
  fs.writeFileSync(path.resolve(nonCapDir, 'cap.meta.ts'),
    `export default { name: 'ignored' };`);

  try {
    const caps = await loadCapsFromDirectory(testRoot);
    assert.equal(caps.length, 0, 'should ignore non-.cap directories');
  } finally {
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
  }
});

test('loadCapsFromDirectory ignores regular files', async () => {
  const testRoot = path.resolve(FIXTURES_DIR, 'tmp-files-test');
  fs.mkdirSync(testRoot, { recursive: true });
  fs.writeFileSync(path.resolve(testRoot, 'readme.md'), '# Hello');
  fs.writeFileSync(path.resolve(testRoot, 'config.json'), '{}');

  try {
    const caps = await loadCapsFromDirectory(testRoot);
    assert.equal(caps.length, 0, 'should ignore regular files');
  } finally {
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
  }
});

test('loadCapsRegistriesFromDirectory skips directories without caps.ts', async () => {
  const testRoot = path.resolve(FIXTURES_DIR, 'tmp-skip-test');
  const dirA = path.resolve(testRoot, 'module-a');
  const dirNoCaps = path.resolve(testRoot, 'no-caps');

  if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
  fs.mkdirSync(dirA, { recursive: true });
  fs.mkdirSync(dirNoCaps, { recursive: true });

  fs.writeFileSync(path.resolve(dirA, 'caps.ts'),
    `export default { name: 'module-a', caps: [{ class: class { async fa(i: any, c: any) { return {}; } }, meta: { name: 'a' } }] };`);
  // dirNoCaps has no caps.ts

  try {
    const registries = await loadCapsRegistriesFromDirectory(testRoot);
    assert.equal(registries.length, 1);
    assert.equal(registries[0].name, 'module-a');
  } finally {
    if (fs.existsSync(testRoot)) fs.rmSync(testRoot, { recursive: true });
  }
});

test('detectDuplicateCapNames handles empty array', () => {
  const result = detectDuplicateCapNames([]);
  assert.deepStrictEqual(result, []);
});

test('detectDuplicateCapNames handles single cap', () => {
  const result = detectDuplicateCapNames([{ name: 'only-one' }]);
  assert.deepStrictEqual(result, []);
});

test('detectDuplicateCapNames finds multiple duplicates', () => {
  const metas: CapMeta[] = [
    { name: 'a' }, { name: 'b' }, { name: 'a' },
    { name: 'c' }, { name: 'b' }, { name: 'c' },
  ];
  const result = detectDuplicateCapNames(metas);
  assert.equal(result.length, 3);
  assert.ok(result.includes('a'));
  assert.ok(result.includes('b'));
  assert.ok(result.includes('c'));
});

test('detectDuplicateCapNames returns unique names only once', () => {
  const metas: CapMeta[] = [
    { name: 'a' }, { name: 'a' }, { name: 'a' },
  ];
  const result = detectDuplicateCapNames(metas);
  assert.deepStrictEqual(result, ['a']);
});

test('detectCapCycle handles empty array', () => {
  const result = detectCapCycle([]);
  assert.equal(result, null);
});

test('detectCapCycle handles single cap', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  const result = detectCapCycle([{ class: Cap, meta: { name: 'a' } }]);
  assert.equal(result, null);
});

test('detectCapCycle handles self-dependency', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  const result = detectCapCycle([{ class: Cap, meta: { name: 'a', dependencies: ['a'] } }]);
  assert.ok(result, 'should detect self-dependency cycle');
  assert.ok(result!.includes('a'));
});

test('detectCapCycle handles disconnected graphs', () => {
  class Cap { async x(i: any, c: any) { return {}; } }
  const caps: CapDefinition[] = [
    { class: Cap, meta: { name: 'a', dependencies: ['b'] } },
    { class: Cap, meta: { name: 'b', dependencies: ['a'] } },
    { class: Cap, meta: { name: 'c', dependencies: ['d'] } },
    { class: Cap, meta: { name: 'd', dependencies: ['c'] } },
  ];
  const result = detectCapCycle(caps);
  assert.ok(result, 'should detect cycle in disconnected graph');
});

test('convertCapToManifest routes are stored as extra property', () => {
  class Cap { async handle(i: any, c: any) { return {}; } }
  const routes: CapRoute[] = [
    { method: 'POST', path: '/api/test', action: 'handle' },
  ];
  const def: CapDefinition = {
    class: Cap,
    meta: { name: 'x', routes },
  };
  const manifest = convertCapToManifest(def);
  assert.ok((manifest as any).routes);
  assert.equal((manifest as any).routes.length, 1);
  assert.equal((manifest as any).routes[0].path, '/api/test');
});

test('convertCapToManifest omits routes when not defined', () => {
  class Cap { async a(i: any, c: any) { return {}; } }
  const def: CapDefinition = { class: Cap, meta: { name: 'x' } };
  const manifest = convertCapToManifest(def);
  assert.equal((manifest as any).routes, undefined);
});

test('action handlers are properly bound to instances', async () => {
  class BoundCap {
    private instanceId = 'unique-123';
    async getId(input: any, ctx: any) { return { id: this.instanceId }; }
  }
  const def: CapDefinition = { class: BoundCap, meta: { name: 'bound' } };
  const manifest = convertCapToManifest(def);
  const result = await manifest.actions.getId.handler({ body: {} }, {} as any);
  assert.equal(result.id, 'unique-123');
});

test('manifest action descriptions include cap name', () => {
  class Cap { async test(i: any, c: any) { return {}; } }
  const def: CapDefinition = { class: Cap, meta: { name: 'my-cap' } };
  const manifest = convertCapToManifest(def);
  assert.equal(manifest.actions.test.description, 'Cap "my-cap" action: test');
});

test('registry manifest action descriptions include cap name', () => {
  class CapA { async actionA(i: any, c: any) { return {}; } }
  class CapB { async actionB(i: any, c: any) { return {}; } }
  const registry: CapsuleRegistry = {
    name: 'multi',
    caps: [
      { class: CapA, meta: { name: 'cap-a' } },
      { class: CapB, meta: { name: 'cap-b' } },
    ],
  };
  const manifest = convertRegistryToManifest(registry);
  assert.equal(manifest.actions.actionA.description, 'Cap "cap-a" action: actionA');
  assert.equal(manifest.actions.actionB.description, 'Cap "cap-b" action: actionB');
});

test('convertRegistryToManifest warns on duplicate action names', () => {
  // Capture console.warn
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => warnings.push(msg);

  try {
    class CapA { async shared(i: any, c: any) { return { from: 'a' }; } }
    class CapB { async shared(i: any, c: any) { return { from: 'b' }; } }
    const registry: CapsuleRegistry = {
      name: 'dup-actions',
      caps: [
        { class: CapA, meta: { name: 'a' } },
        { class: CapB, meta: { name: 'b' } },
      ],
    };
    const manifest = convertRegistryToManifest(registry);

    assert.ok(warnings.some(w => w.includes('shared')));
    assert.ok(warnings.some(w => w.includes('dup-actions')));
    // Last definition wins
    const result = manifest.actions.shared.handler({ body: {} }, {} as any);
    // We can't easily assert async result here, but we verify warning was emitted
  } finally {
    console.warn = originalWarn;
  }
});

// ===================================================================
// Integration tests with fixtures
// ===================================================================

suite('Integration: Fixture Loading');

testAsync('loads calculator.cap fixture', async () => {
  const calcDir = path.resolve(FIXTURES_DIR, 'calculator.cap');
  assert.ok(fs.existsSync(calcDir), `Fixture dir should exist: ${calcDir}`);
  const capDef = await loadCapFromDir(calcDir);
  assert.ok(capDef, 'Should return a CapDefinition');
  assert.equal(capDef!.meta.name, 'calculator');
  assert.ok(capDef!.class, 'Should have a class');
});

testAsync('loads auth.cap fixture with dependencies', async () => {
  const authDir = path.resolve(FIXTURES_DIR, 'auth.cap');
  const capDef = await loadCapFromDir(authDir);
  assert.ok(capDef, 'Should return a CapDefinition');
  assert.equal(capDef!.meta.name, 'auth');
  assert.ok(capDef!.meta.dependencies?.includes('database'), 'Should have database dependency');
});

testAsync('throws CapLoadError for broken.cap fixture', async () => {
  const brokenDir = path.resolve(FIXTURES_DIR, 'broken.cap');
  await assert.rejects(
    () => loadCapFromDir(brokenDir),
    CapLoadError,
  );
});

// ===================================================================
// Summary
// ===================================================================

console.log('\n' + '='.repeat(60));
console.log(`Test Results: ${totalPassed} passed, ${totalFailed} failed, ${totalPassed + totalFailed} total`);

if (totalFailed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  ❌ [${r.suite}] ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('\n✅ All cap loading tests passed!');
}
