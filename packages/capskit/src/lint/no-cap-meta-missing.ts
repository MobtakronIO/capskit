/**
 * ESLint rule: @capskit/no-cap-meta-missing
 *
 * Validates that every .cap directory containing a cap.ts file
 * also has a corresponding cap.meta.ts file.
 *
 * The Cap model requires each .cap directory to have both:
 * - cap.ts — the business logic class (CapClass)
 * - cap.meta.ts — the metadata contract (CapMeta)
 *
 * @example
 * // ❌ Error — missing cap.meta.ts
 * // Directory: users.cap/
 * //   cap.ts          ✓
 * //   cap.meta.ts     ✗ MISSING
 *
 * // ✅ OK
 * // Directory: users.cap/
 * //   cap.ts          ✓
 * //   cap.meta.ts     ✓
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Rule } from 'eslint';

const RULE_NAME = '@capskit/no-cap-meta-missing';
const CAP_FILE_PATTERN = /^cap\.(ts|js|mjs|cjs)$/;
const META_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];

// Track directories already reported to avoid duplicate errors
const reportedDirs = new Set<string>();

export const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require cap.meta.ts in every .cap directory that has a cap.ts file',
      recommended: 'error',
      url: 'https://capskit.dev/guide/capsules#cap-directory-structure',
    },
    schema: [],
    messages: {
      missingMeta:
        'Missing cap.meta.ts in .cap directory "{{ dir }}". ' +
        'Every .cap directory must contain both cap.ts (business logic) and cap.meta.ts (metadata).',
    },
  },

  create(context) {
    const filename = context.filename || (context as any).getFilename?.() || '';
    const dir = path.dirname(filename);
    const basename = path.basename(filename);

    // Only relevant inside a .cap directory
    const parentDirName = path.basename(dir);
    if (!parentDirName.endsWith('.cap')) {
      return {};
    }

    // Only run when we land on a cap.ts (or cap.js etc.)
    if (!CAP_FILE_PATTERN.test(basename)) {
      return {};
    }

    // Deduplicate: only report once per directory
    if (reportedDirs.has(dir)) {
      return {};
    }

    // Check if cap.meta.{ts,js,mjs,cjs} exists in the same directory
    const metaExists = META_EXTENSIONS.some((ext) =>
      fs.existsSync(path.join(dir, `cap.meta${ext}`)),
    );

    if (!metaExists) {
      reportedDirs.add(dir);

      context.report({
        loc: { line: 1, column: 0 },
        messageId: 'missingMeta',
        data: { dir },
      });
    }

    return {};
  },
};

export default rule;
