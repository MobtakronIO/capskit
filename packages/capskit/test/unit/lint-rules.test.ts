/**
 * Lint Rules Unit Tests
 *
 * Comprehensive tests for all 6 CapsKit ESLint rules covering valid structures
 * (no violations) and invalid structures (expected violations).
 *
 * Rules tested:
 * - @capskit/no-direct-call               (AST-based, no filesystem)
 * - @capskit/no-cap-meta-missing          (filesystem: cap.ts requires cap.meta.ts)
 * - @capskit/no-cap-logic-missing         (filesystem: cap.meta.ts requires cap.ts)
 * - @capskit/caps-registry-required       (filesystem: dir w/ .cap/ needs caps.ts)
 * - @capskit/no-manifest-in-cap           (filesystem: no manifest.ts in .cap/)
 * - @capskit/no-framework-coupling-in-cap (AST-based: no framework imports in cap.ts)
 *
 * Valid structures (expected: ZERO violations):
 *   - Properly paired cap.ts + cap.meta.ts
 *   - caps.ts at capsule root when .cap subdirectories exist
 *   - capskit.use() API pattern (not capskit.call())
 *   - ctx.call() in action handler context
 *   - No manifest.ts inside .cap directories
 *   - No framework imports inside cap.ts
 *
 * Invalid structures (expected: violations reported):
 *   - Missing cap.meta.ts when cap.ts exists in .cap/
 *   - Missing cap.ts when cap.meta.ts exists in .cap/
 *   - Missing caps.ts in directory with .cap subdirectories
 *   - Direct capskit.call() in user-land code
 *   - Legacy manifest.ts inside .cap directories
 *   - Framework imports (elysia, express, fastify, etc.) inside cap.ts
 */

import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const require = createRequire(import.meta.url);

// ── Rule imports ──────────────────────────────────────────────────────────
import { rule as noDirectCall } from '../../src/lint/no-direct-call';
import { rule as noCapMetaMissing } from '../../src/lint/no-cap-meta-missing';
import { rule as noCapLogicMissing } from '../../src/lint/no-cap-logic-missing';
import { rule as capsRegistryRequired } from '../../src/lint/caps-registry-required';
import { rule as noManifestInCap } from '../../src/lint/no-manifest-in-cap';
import { rule as noFrameworkCouplingInCap } from '../../src/lint/no-framework-coupling-in-cap';
import maxCapSteps from '../../src/lint/max-cap-steps';

// ── Temp fixture infrastructure ───────────────────────────────────────────

const TMP_BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'capskit-lint-'));

/**
 * Create a file with content, creating parent dirs as needed.
 * Returns the absolute path.
 */
function mkfile(filePath: string, content: string): string {
  const full = path.join(TMP_BASE, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// ── Build all filesystem fixtures ─────────────────────────────────────────

// ---- no-cap-meta-missing fixtures ----
mkfile('no-meta/valid.cap/cap.ts', 'export default class ValidCap {}');
mkfile('no-meta/valid.cap/cap.meta.ts', 'export default { name: "valid" };');
mkfile('no-meta/missing-meta.cap/cap.ts', 'export default class MissingMetaCap {}');
mkfile('no-meta/regular-dir/some-file.ts', 'export const x = 1;');
mkfile('no-meta/valid.cap/not-cap.ts', 'export const helper = () => {};');

// ---- no-cap-logic-missing fixtures ----
mkfile('no-logic/valid.cap/cap.ts', 'export default class ValidCap {}');
mkfile('no-logic/valid.cap/cap.meta.ts', 'export default { name: "valid" };');
mkfile('no-logic/missing-logic.cap/cap.meta.ts', 'export default { name: "missing-logic" };');
mkfile('no-logic/regular-dir/some-file.ts', 'export const x = 1;');
mkfile('no-logic/valid.cap/not-meta.ts', 'export const helper = () => {};');

// ---- caps-registry-required fixtures ----
mkfile('caps-registry/with-registry/caps.ts', 'export default { caps: {} };');
mkfile('caps-registry/with-registry/some.cap/cap.ts', 'export default class SomeCap {}');
mkfile('caps-registry/with-registry/some.cap/cap.meta.ts', 'export default { name: "some" };');
mkfile('caps-registry/with-registry/some-other.ts', 'export const x = 1;');

mkfile('caps-registry/without-registry/orphan.cap/cap.ts', 'export default class OrphanCap {}');
mkfile('caps-registry/without-registry/orphan.cap/cap.meta.ts', 'export default { name: "orphan" };');
mkfile('caps-registry/without-registry/some-file.ts', 'export const y = 1;');

mkfile('caps-registry/no-caps/plain.ts', 'export const z = 1;');

// ---- no-manifest-in-cap fixtures ----
mkfile('no-manifest/dup.cap/cap.ts', 'export default class DupCap {}');
mkfile('no-manifest/dup.cap/cap.meta.ts', 'export default { name: "dup" };');
mkfile('no-manifest/dup.cap/manifest.ts', 'export default { name: "old-dup" };');
mkfile('no-manifest/manifest-only.cap/manifest.ts', 'export default { name: "only-manifest" };');
mkfile('no-manifest/manifest-outside/manifest.ts', 'export default { name: "outside" };');

// ---- no-framework-coupling-in-cap fixtures ----
mkfile('no-framework/clean.cap/cap.ts', `import { Something } from '../utils';
export default class CleanCap {}`);
mkfile('no-framework/framework.cap/cap.ts', `import { Elysia } from 'elysia';
export default class BadCap {}`);
mkfile('no-framework/adapter.cap/cap.ts', `import { ElysiaAdapter } from '@mobtakronio/elysia';
export default class BadCap {}`);
mkfile('no-framework/express.cap/cap.ts', `export default class BadCap {}`);
mkfile('no-framework/not-cap-dir/some.ts', `import { Elysia } from 'elysia';
export const x = 1;`);
mkfile('no-framework/koa.cap/cap.ts', `export default class BadCap {}`);
mkfile('no-framework/hapi.cap/cap.ts', `export default class BadCap {}`);
mkfile('no-framework/subpath.cap/cap.ts', `export default class BadCap {}`);
mkfile('no-framework/suspicious.cap/cap.ts', `export default class BadCap {}`);
mkfile('no-framework/banned-cors.cap/cap.ts', `export default class BadCap {}`);
mkfile('no-framework/additional.cap/cap.ts', `export default class BadCap {}`);
mkfile('no-framework/additional.cap/cap.meta.ts', `export default { name: "additional" };`);

// ---- extra js/mjs/cjs variant fixtures ----
mkfile('js-variants/valid-js.cap/cap.js', 'export default class ValidCapJS {}');
mkfile('js-variants/valid-js.cap/cap.meta.js', 'export default { name: "valid-js" };');
mkfile('js-variants/missing-meta.cap/cap.js', 'export default class MissingMetaJS {}');
mkfile('js-variants/missing-logic.cap/cap.meta.js', 'export default { name: "missing-js-logic" };');
mkfile('js-variants/manifest-js.cap/manifest.js', 'export default { name: "old-manifest-js" };');
mkfile('js-variants/with-registry/caps.js', 'export default { caps: {} };');
mkfile('js-variants/with-registry/js-cap.cap/cap.js', 'export default class JSCap {}');
mkfile('js-variants/with-registry/js-cap.cap/cap.meta.js', 'export default { name: "js-cap" };');
mkfile('js-variants/without-registry/orphan.cap/cap.js', 'export default class OrphanJS {}');
mkfile('js-variants/without-registry/orphan.cap/cap.meta.js', 'export default { name: "orphan-js" };');
mkfile('js-variants/without-registry/plain.js', 'export const z = 1;');

// ---- dual-format meta (cap.meta.ts already exists alongside manifest.ts) ----
mkfile('no-manifest/only-manifest-no-meta.cap/manifest.ts', 'export default { name: "solo-manifest" };');
mkfile('no-manifest/only-manifest-no-meta.cap/cap.ts', 'export default class SoloCap {}');

// ---- caps-registry-required with nested .cap ----
mkfile('caps-registry/nested-caps/inner/deep.cap/cap.ts', 'export default class DeepCap {}');
mkfile('caps-registry/nested-caps/inner/deep.cap/cap.meta.ts', 'export default { name: "deep" };');
mkfile('caps-registry/nested-caps/inner/some-file.ts', 'export const nested = 1;');
mkfile('caps-registry/nested-caps/outer-file.ts', 'export const outer = 1;');

// ---- allowDirectories variant ----
mkfile('caps-registry/allowed-dir/legacy.cap/cap.ts', 'export default class LegacyCap {}');
mkfile('caps-registry/allowed-dir/legacy.cap/cap.meta.ts', 'export default { name: "legacy" };');
mkfile('caps-registry/allowed-dir/legacy-file.ts', 'export const legacy = 1;');

// ── Convenience path getters ──────────────────────────────────────────────

const P = {
  // no-cap-meta-missing
  NM_NON_CAP: path.join(TMP_BASE, 'no-meta', 'regular-dir', 'some-file.ts'),
  NM_NOT_CAP_FILE: path.join(TMP_BASE, 'no-meta', 'valid.cap', 'not-cap.ts'),
  NM_VALID_CAP: path.join(TMP_BASE, 'no-meta', 'valid.cap', 'cap.ts'),
  NM_MISSING_CAP: path.join(TMP_BASE, 'no-meta', 'missing-meta.cap', 'cap.ts'),
  // no-cap-logic-missing
  NL_NON_CAP: path.join(TMP_BASE, 'no-logic', 'regular-dir', 'some-file.ts'),
  NL_NOT_META: path.join(TMP_BASE, 'no-logic', 'valid.cap', 'not-meta.ts'),
  NL_VALID_META: path.join(TMP_BASE, 'no-logic', 'valid.cap', 'cap.meta.ts'),
  NL_MISSING_META: path.join(TMP_BASE, 'no-logic', 'missing-logic.cap', 'cap.meta.ts'),
  // caps-registry-required
  CR_WO_CAP_DIR: path.join(TMP_BASE, 'caps-registry', 'without-registry', 'orphan.cap', 'cap.ts'),
  CR_WITH_CAPS: path.join(TMP_BASE, 'caps-registry', 'with-registry', 'caps.ts'),
  CR_WITH_OTHER: path.join(TMP_BASE, 'caps-registry', 'with-registry', 'some-other.ts'),
  CR_NO_CAP: path.join(TMP_BASE, 'caps-registry', 'no-caps', 'plain.ts'),
  CR_WO_OTHER: path.join(TMP_BASE, 'caps-registry', 'without-registry', 'some-file.ts'),
  // no-manifest-in-cap
  MI_DUP_CAP: path.join(TMP_BASE, 'no-manifest', 'dup.cap', 'cap.ts'),
  MI_OUTSIDE: path.join(TMP_BASE, 'no-manifest', 'manifest-outside', 'manifest.ts'),
  MI_ONLY: path.join(TMP_BASE, 'no-manifest', 'manifest-only.cap', 'manifest.ts'),
  MI_DUP_MANIFEST: path.join(TMP_BASE, 'no-manifest', 'dup.cap', 'manifest.ts'),
  // no-framework-coupling-in-cap
  FC_CLEAN: path.join(TMP_BASE, 'no-framework', 'clean.cap', 'cap.ts'),
  FC_NOT_CAP: path.join(TMP_BASE, 'no-framework', 'not-cap-dir', 'some.ts'),
  FC_ROOT_CAP: path.join(TMP_BASE, 'cap.ts'),
  FC_ALLOWED: path.join(TMP_BASE, 'allowed.cap', 'cap.ts'),
  FC_FRAMEWORK: path.join(TMP_BASE, 'no-framework', 'framework.cap', 'cap.ts'),
  FC_ADAPTER: path.join(TMP_BASE, 'no-framework', 'adapter.cap', 'cap.ts'),
  FC_EXPRESS: path.join(TMP_BASE, 'no-framework', 'express.cap', 'cap.ts'),
  FC_KOA: path.join(TMP_BASE, 'no-framework', 'koa.cap', 'cap.ts'),
  FC_HAPI: path.join(TMP_BASE, 'no-framework', 'hapi.cap', 'cap.ts'),
  FC_SUBPATH: path.join(TMP_BASE, 'no-framework', 'subpath.cap', 'cap.ts'),
  FC_SUSPICIOUS: path.join(TMP_BASE, 'no-framework', 'suspicious.cap', 'cap.ts'),
  FC_BANNED_CORS: path.join(TMP_BASE, 'no-framework', 'banned-cors.cap', 'cap.ts'),
  FC_ADDITIONAL: path.join(TMP_BASE, 'no-framework', 'additional.cap', 'cap.ts'),
  // js variants
  JV_VALID_JS_CAP: path.join(TMP_BASE, 'js-variants', 'valid-js.cap', 'cap.js'),
  JV_MISSING_META: path.join(TMP_BASE, 'js-variants', 'missing-meta.cap', 'cap.js'),
  JV_MISSING_LOGIC: path.join(TMP_BASE, 'js-variants', 'missing-logic.cap', 'cap.meta.js'),
  JV_MANIFEST_JS: path.join(TMP_BASE, 'js-variants', 'manifest-js.cap', 'manifest.js'),
  JV_CAPS_JS: path.join(TMP_BASE, 'js-variants', 'with-registry', 'caps.js'),
  JV_WITH_OTHER_JS: path.join(TMP_BASE, 'js-variants', 'with-registry', 'plain.js'),
  JV_WO_CAP_JS: path.join(TMP_BASE, 'js-variants', 'without-registry', 'orphan.cap', 'cap.js'),
  JV_WO_PLAIN_JS: path.join(TMP_BASE, 'js-variants', 'without-registry', 'plain.js'),
  // no-manifest extended
  MI_NO_META_MANIFEST: path.join(TMP_BASE, 'no-manifest', 'only-manifest-no-meta.cap', 'manifest.ts'),
  // caps-registry extended
  CR_NESTED_FILE: path.join(TMP_BASE, 'caps-registry', 'nested-caps', 'inner', 'some-file.ts'),
  CR_NESTED_OUTER: path.join(TMP_BASE, 'caps-registry', 'nested-caps', 'outer-file.ts'),
  CR_ALLOWED_FILE: path.join(TMP_BASE, 'caps-registry', 'allowed-dir', 'legacy-file.ts'),
};

// ── Shared RuleTester config ──────────────────────────────────────────────

const testerConfig = {
  languageOptions: {
    parser: require('@typescript-eslint/parser'),
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: false },
    },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// RULE 1: @capskit/no-direct-call
// ═══════════════════════════════════════════════════════════════════════════

new RuleTester(testerConfig).run('@capskit/no-direct-call', noDirectCall, {
  valid: [
    // 1. Using the recommended capskit.use() pattern
    `const users = capskit.use('users');
await users.create({ email: 'test@example.com' });`,

    // 2. No capskit.call() calls at all
    `const result = await someOtherFunction();
console.log(result);`,

    // 3. ctx.call() in action handler context (allowed by default allowInContext)
    `async function handler(ctx: any) {
  const result = await ctx.call('users.find', { id: 1 });
  return result;
}`,

    // 4. capskit.call() for system capsule (allowed by default allowList)
    `await capskit.call('system.getHealth', {});`,

    // 5. capskit.call() for http capsule (allowed by default allowList)
    `await capskit.call('http.buildRouter', { adapter: 'elysia' });`,

    // 6. capskit.call() for websocket capsule (allowed by default allowList)
    `await capskit.call('websocket.upgrade', {});`,

    // 7. A method named "call" that is not capskit.call
    `const result = someObj.call('something');`,

    // 8. capskit.someOtherMethod (not .call)
    `await capskit.use('users');
await capskit.emit('event', {});`,

    // 9. capskit.call() where first arg is a variable (not a string literal) — can't detect capsule
    `const actionName = getActionName();
await capskit.call(actionName, { payload: true });`,

    // 10. capskit.call() with no arguments — should be ignored
    `capskit.call();`,

    // 11. capskit.call() with action name that has no dot — can't split, ignore
    `await capskit.call('justAction', { data: 1 });`,

    // 12. Nested object .call that isn't capskit.call
    `const result = capskit.config.call(this);`,

    // 13. Custom allowInContext — named variable allowed
    {
      code: `await internal.call('users.create', { email: 'x' });`,
      options: [{ allowInContext: ['internal'] }],
    },
  ],

  invalid: [
    // 1. Direct capskit.call() with a user-land capsule — suggest use()
    {
      code: `await capskit.call('users.create', { email: 'test@example.com' });`,
      errors: [
        {
          messageId: 'directCall',
          data: { action: 'create', capsule: 'users' },
          suggestions: [
            {
              messageId: 'directCallWithSuggestion',
              data: { capsule: 'users', action: 'create' },
              output: `await capskit.use('users').create({ email: 'test@example.com' });`,
            },
          ],
        },
      ],
    },

    // 2. Direct capskit.call() with another action
    {
      code: `await capskit.call('orders.fulfill', { orderId: '123' });`,
      errors: [
        {
          messageId: 'directCall',
          data: { action: 'fulfill', capsule: 'orders' },
          suggestions: [
            {
              messageId: 'directCallWithSuggestion',
              data: { capsule: 'orders', action: 'fulfill' },
              output: `await capskit.use('orders').fulfill({ orderId: '123' });`,
            },
          ],
        },
      ],
    },

    // 3. Direct capskit.call() with deep action path
    {
      code: `await capskit.call('inventory.stock.reserve', { sku: 'A123', qty: 5 });`,
      errors: [
        {
          messageId: 'directCall',
          data: { action: 'stock', capsule: 'inventory' },
          suggestions: [
            {
              messageId: 'directCallWithSuggestion',
              data: { capsule: 'inventory', action: 'stock' },
              output: `await capskit.use('inventory').stock({ sku: 'A123', qty: 5 });`,
            },
          ],
        },
      ],
    },

    // 4. capskit.call() on a non-allowList capsule with no whitelist override
    {
      code: `await capskit.call('custom.capsule', {});`,
      options: [{ allowList: [] }],
      errors: [
        {
          messageId: 'directCall',
          data: { action: 'capsule', capsule: 'custom' },
          suggestions: [
            {
              messageId: 'directCallWithSuggestion',
              data: { capsule: 'custom', action: 'capsule' },
              output: `await capskit.use('custom').capsule({});`,
            },
          ],
        },
      ],
    },

    // 5. Template literal action name
    {
      code: `await capskit.call(\`products.search\`, { query: 'shoes' });`,
      errors: [
        {
          messageId: 'directCall',
          data: { action: 'search', capsule: 'products' },
          suggestions: [
            {
              messageId: 'directCallWithSuggestion',
              data: { capsule: 'products', action: 'search' },
              output: `await capskit.use('products').search({ query: 'shoes' });`,
            },
          ],
        },
      ],
    },
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
// RULE 2: @capskit/no-cap-meta-missing
// ═══════════════════════════════════════════════════════════════════════════

new RuleTester(testerConfig).run('@capskit/no-cap-meta-missing', noCapMetaMissing, {
  valid: [
    // File NOT in a .cap directory — should be ignored
    { code: 'export default class RegularClass {}', filename: P.NM_NON_CAP },
    // File in a .cap directory but NOT named cap.ts — should be ignored
    { code: 'export const helper = () => {};', filename: P.NM_NOT_CAP_FILE },
    // File IS cap.ts in a .cap directory AND cap.meta.ts exists — valid
    { code: 'export default class ValidCap {}', filename: P.NM_VALID_CAP },
    // .cap directory with cap.js AND cap.meta.js — valid (JS variant)
    { code: 'export default class ValidCapJS {}', filename: P.JV_VALID_JS_CAP },
    // File named cap.meta.ts (not cap.ts) — other rule's domain
    { code: 'export default { name: "meta" };', filename: P.NL_VALID_META },
    // Nested .cap directory (deep path) with both files — valid
    {
      code: 'export default class DeepCap {}',
      filename: path.join(TMP_BASE, 'caps-registry', 'nested-caps', 'inner', 'deep.cap', 'cap.ts'),
    },
  ],

  invalid: [
    // cap.ts exists in .cap directory but cap.meta.ts is missing
    {
      code: 'export default class MissingMetaCap {}',
      filename: P.NM_MISSING_CAP,
      errors: [{ messageId: 'missingMeta' }],
    },
    // cap.js exists in .cap directory but cap.meta.js is missing (JS variant)
    {
      code: 'export default class MissingMetaJS {}',
      filename: P.JV_MISSING_META,
      errors: [{ messageId: 'missingMeta' }],
    },
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
// RULE 3: @capskit/no-cap-logic-missing
// ═══════════════════════════════════════════════════════════════════════════

new RuleTester(testerConfig).run('@capskit/no-cap-logic-missing', noCapLogicMissing, {
  valid: [
    // File NOT in a .cap directory — should be ignored
    { code: 'export const x = 1;', filename: P.NL_NON_CAP },
    // File in .cap directory but NOT named cap.meta.ts — should be ignored
    { code: 'export const helper = () => {};', filename: P.NL_NOT_META },
    // File IS cap.meta.ts in .cap directory AND cap.ts exists — valid
    { code: 'export default { name: "valid" };', filename: P.NL_VALID_META },
  ],

  invalid: [
    // cap.meta.ts exists in .cap directory but cap.ts is missing
    {
      code: 'export default { name: "missing-logic" };',
      filename: P.NL_MISSING_META,
      errors: [{ messageId: 'missingLogic' }],
    },
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
// RULE 4: @capskit/caps-registry-required
// ═══════════════════════════════════════════════════════════════════════════

new RuleTester(testerConfig).run('@capskit/caps-registry-required', capsRegistryRequired, {
  valid: [
    // File inside a .cap directory — skipped (other rules handle this)
    { code: 'export default class OrphanCap {}', filename: P.CR_WO_CAP_DIR },
    // File is caps.ts itself — no need to report
    { code: 'export default { caps: {} };', filename: P.CR_WITH_CAPS },
    // Directory with .cap subdirs but has caps.ts — valid
    { code: 'export const x = 1;', filename: P.CR_WITH_OTHER },
    // Directory without .cap subdirectories — no requirement
    { code: 'export const z = 1;', filename: P.CR_NO_CAP },
  ],

  invalid: [
    // Directory has .cap subdirectories but NO caps.ts at root
    {
      code: 'export const y = 1;',
      filename: P.CR_WO_OTHER,
      errors: [{ messageId: 'missingRegistry' }],
    },
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
// RULE 5: @capskit/no-manifest-in-cap
// ═══════════════════════════════════════════════════════════════════════════

new RuleTester(testerConfig).run('@capskit/no-manifest-in-cap', noManifestInCap, {
  valid: [
    // File is NOT named manifest.ts — ignored
    { code: 'export default class DupCap {}', filename: P.MI_DUP_CAP },
    // File IS manifest.ts but NOT inside a .cap directory — allowed
    { code: 'export default { name: "outside" };', filename: P.MI_OUTSIDE },
    // manifest.ts in .cap dir with alwaysError=false and no cap.meta.ts — allowed
    {
      code: 'export default { name: "only-manifest" };',
      filename: P.MI_ONLY,
      options: [{ alwaysError: false }],
    },
  ],

  invalid: [
    // Both manifest.ts and cap.meta.ts in .cap dir — duplicate metadata
    {
      code: 'export default { name: "old-dup" };',
      filename: P.MI_DUP_MANIFEST,
      errors: [{ messageId: 'duplicateMetadata' }],
    },
    // manifest.ts in .cap dir without cap.meta.ts (alwaysError default = true)
    {
      code: 'export default { name: "only-manifest" };',
      filename: P.MI_ONLY,
      errors: [{ messageId: 'legacyManifest' }],
    },
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
// RULE 6: @capskit/no-framework-coupling-in-cap
// ═══════════════════════════════════════════════════════════════════════════

new RuleTester(testerConfig).run(
  '@capskit/no-framework-coupling-in-cap',
  noFrameworkCouplingInCap,
  {
    valid: [
      // cap.ts in .cap dir with no banned imports — clean (virtual path)
      {
        code: `import { Something } from '../utils';\nexport default class CleanCap {}`,
        filename: '/capskit/clean.cap/cap.ts',
      },
      // File is NOT cap.ts (even with framework import) — ignored
      {
        code: `import { Elysia } from 'elysia';\nexport const x = 1;`,
        filename: '/capskit/not-a-cap/some-file.ts',
      },
      // cap.ts but not in .cap directory (e.g., at project root) — ignored
      {
        code: `import { Elysia } from 'elysia'; export default class RootCap {}`,
        filename: '/capskit/cap.ts',
      },
      // allowList exempts a normally-banned package
      {
        code: `import { Elysia } from 'elysia';\nexport default class AllowedCap {}`,
        filename: '/capskit/allowed.cap/cap.ts',
        options: [{ allowList: ['elysia'] }],
      },
    ],

    invalid: [
      // 1. Direct Elysia import in cap.ts
      {
        code: `import { Elysia } from 'elysia';\nexport default class BadCap {}`,
        filename: '/capskit/framework.cap/cap.ts',
        errors: [
          {
            messageId: 'frameworkImport',
            data: { importSource: 'elysia', file: '/capskit/framework.cap/cap.ts' },
          },
        ],
      },
      // 2. CapsKit adapter import in cap.ts
      {
        code: `import { ElysiaAdapter } from '@mobtakronio/elysia';\nexport default class BadCap {}`,
        filename: '/capskit/adapter.cap/cap.ts',
        errors: [
          {
            messageId: 'adapterImport',
            data: { importSource: '@mobtakronio/elysia', file: '/capskit/adapter.cap/cap.ts' },
          },
        ],
      },
      // 3. Express import in cap.ts
      {
        code: `import express from 'express';\nexport default class BadCap {}`,
        filename: '/capskit/express.cap/cap.ts',
        errors: [
          {
            messageId: 'frameworkImport',
            data: { importSource: 'express', file: '/capskit/express.cap/cap.ts' },
          },
        ],
      },
      // 4. Fastify import in cap.ts
      {
        code: `import fastify from 'fastify';\nexport default class BadCap {}`,
        filename: '/capskit/fastify.cap/cap.ts',
        errors: [
          {
            messageId: 'frameworkImport',
            data: { importSource: 'fastify', file: '/capskit/fastify.cap/cap.ts' },
          },
        ],
      },
      // 5. Hono import in cap.ts
      {
        code: `import { Hono } from 'hono';\nexport default class BadCap {}`,
        filename: '/capskit/hono.cap/cap.ts',
        errors: [
          {
            messageId: 'frameworkImport',
            data: { importSource: 'hono', file: '/capskit/hono.cap/cap.ts' },
          },
        ],
      },
      // 6. Dynamic import of elysia via await import()
      {
        code: `export default class BadCap {\n  async init() {\n    const elysia = await import('elysia');\n  }\n}`,
        filename: '/capskit/dynamic.cap/cap.ts',
        errors: [
          {
            messageId: 'frameworkImport',
            data: { importSource: 'elysia', file: '/capskit/dynamic.cap/cap.ts' },
          },
        ],
      },
      // 7. require() call for express in cap.ts
      {
        code: `const express = require('express');\nexport default class BadCap {}`,
        filename: '/capskit/require.cap/cap.ts',
        errors: [
          {
            messageId: 'frameworkImport',
            data: { importSource: 'express', file: '/capskit/require.cap/cap.ts' },
          },
        ],
      },
    ],
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// RULE 7: @capskit/max-cap-steps
// ═══════════════════════════════════════════════════════════════════════════

new RuleTester(testerConfig).run('@capskit/max-cap-steps', maxCapSteps, {
  valid: [
    // Thin orchestrator — 3 steps (parse, load, return)
    {
      code: `export default async function boot(input, ctx) {
  const { dirs } = parseBootInput(input);
  const state = buildBootState();
  await loadCapsules(dirs, state);
  return { status: 'ready' };
}`,
      filename: '/capsule/caps/boot.cap.ts',
    },

    // Exactly 4 steps — at the limit
    {
      code: `export default async function process(input, ctx) {
  const data = parseInput(input);
  const validated = validate(data);
  const result = await transform(validated);
  await persist(result);
  return result;
}`,
      filename: '/capsule/caps/process.cap.ts',
    },

    // Only input parsing + return — 0 steps
    {
      code: `export default async function simple(input, ctx) {
  const { name } = input.body || {};
  return { greeting: \`Hello \${name}\` };
}`,
      filename: '/capsule/caps/simple.cap.ts',
    },

    // Non-cap file — ignored regardless of complexity
    {
      code: `export function doEverything() {
  const a = parse();
  const b = load();
  const c = scan();
  const d = validate();
  const e = sort();
  const f = run();
  return { a, b, c, d, e, f };
}`,
      filename: '/capsule/helpers/do-everything.helper.ts',
    },

    // Arrow function export — 2 steps
    {
      code: `export default async (input, ctx) => {
  const data = await fetchData();
  return { data };
}`,
      filename: '/capsule/caps/fetch.cap.ts',
    },
  ],

  invalid: [
    // 5 steps — exceeds limit
    {
      code: `export default async function boot(input, ctx) {
  const { dirs, deps, disable } = input.body;
  const state = { capsules: new Map(), caps: new Map(), deps };
  await loadBuiltins(disable, state);
  await scanUserDirs(dirs, state);
  const sorted = validateAndOrder(state);
  await runLifecycles(sorted, state);
  return { status: 'ready', count: state.capsules.size };
}`,
      filename: '/capsule/caps/boot.cap.ts',
      errors: [
        {
          messageId: 'exceeded',
          data: { file: '/capsule/caps/boot.cap.ts', steps: '5', max: '4' },
        },
      ],
    },

    // 6 steps with loops and conditionals
    {
      code: `export default async function complex(input, ctx) {
  const config = parseConfig(input);
  const state = initState(config);
  for (const item of config.items) {
    await processItem(item, state);
  }
  if (config.validate) {
    validateState(state);
  }
  const sorted = topologicalSort(state);
  await runHooks(sorted);
  return shapeResponse(state);
}`,
      filename: '/capsule/caps/complex.cap.ts',
      errors: [
        {
          messageId: 'exceeded',
          data: { file: '/capsule/caps/complex.cap.ts', steps: '6', max: '4' },
        },
      ],
    },

    // 5 steps with variable declarations that call functions
    {
      code: `export default async function data(input, ctx) {
  const parsed = parseBody(input);
  const connection = await createConnection(parsed);
  const result = await connection.query(parsed.sql);
  const formatted = formatResult(result);
  await connection.close();
  return formatted;
}`,
      filename: '/capsule/caps/query.cap.ts',
      errors: [
        {
          messageId: 'exceeded',
          data: { file: '/capsule/caps/query.cap.ts', steps: '5', max: '4' },
        },
      ],
    },
  ],
});
