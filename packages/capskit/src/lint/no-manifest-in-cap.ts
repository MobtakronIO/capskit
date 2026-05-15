/**
 * ESLint rule: @capskit/no-manifest-in-cap
 *
 * Detects legacy `manifest.ts` files inside `.cap/` directories.
 *
 * The Cap model uses `cap.ts` + `cap.meta.ts` as the canonical format.
 * A `manifest.ts` inside a `.cap/` directory is a legacy artifact that
 * should be migrated to `cap.meta.ts`.  Having both creates confusion
 * about which metadata source is authoritative.
 *
 * @example
 * // ❌ Error — legacy manifest inside .cap directory
 * // Directory: users.cap/
 * //   cap.ts          ✓
 * //   cap.meta.ts     ✓
 * //   manifest.ts     ✗ LEGACY — remove and use cap.meta.ts only
 *
 * // ✅ OK
 * // Directory: users.cap/
 * //   cap.ts          ✓
 * //   cap.meta.ts     ✓
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Rule } from 'eslint';

const RULE_NAME = '@capskit/no-manifest-in-cap';
const MANIFEST_FILE_PATTERN = /^manifest\.(ts|js|mjs|cjs)$/;
const CAP_META_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];

// Track directories already reported to avoid duplicate errors
const reportedDirs = new Set<string>();

export const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow legacy manifest.ts inside .cap directories — migrate to cap.meta.ts',
      recommended: 'error',
      url: 'https://capskit.dev/guide/capsules#cap-directory-structure',
    },
    schema: [
      {
        type: 'object',
        properties: {
          /**
           * When true, the rule also reports an error even when
           * cap.meta.ts is present alongside the manifest.
           * When false, only reports if both manifest.ts and
           * cap.meta.ts are present (duplicate metadata).
           *
           * @default true
           */
          alwaysError: {
            type: 'boolean',
            default: true,
            description:
              'Report an error for any manifest.ts in a .cap directory, even without cap.meta.ts',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      legacyManifest:
        'Legacy manifest.ts found inside .cap directory "{{ dir }}". ' +
        'The Cap model uses cap.meta.ts for metadata. ' +
        'Migrate the manifest contents to cap.meta.ts and delete this file.',
      duplicateMetadata:
        'Both manifest.ts and cap.meta.ts found inside .cap directory "{{ dir }}". ' +
        'The Cap model uses cap.meta.ts as the authoritative metadata source. ' +
        'Delete manifest.ts to avoid confusion about which metadata takes precedence.',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const alwaysError = options.alwaysError !== undefined ? options.alwaysError : true;

    const filename = context.filename || (context as any).getFilename?.() || '';
    const dir = path.dirname(filename);
    const basename = path.basename(filename);

    // Only interested in files named manifest.{ts,js,mjs,cjs}
    if (!MANIFEST_FILE_PATTERN.test(basename)) {
      return {};
    }

    // Only relevant inside a .cap directory
    const parentDirName = path.basename(dir);
    if (!parentDirName.endsWith('.cap')) {
      return {};
    }

    // Deduplicate: only report once per directory
    if (reportedDirs.has(dir)) {
      return {};
    }

    // Check if cap.meta.{ts,js,mjs,cjs} also exists alongside the manifest
    const hasCapMeta = CAP_META_EXTENSIONS.some((ext) =>
      fs.existsSync(path.join(dir, `cap.meta${ext}`)),
    );

    if (hasCapMeta) {
      // Both manifest.ts and cap.meta.ts exist — duplicate metadata
      reportedDirs.add(dir);
      context.report({
        loc: { line: 1, column: 0 },
        messageId: 'duplicateMetadata',
        data: { dir },
      });
    } else if (alwaysError) {
      // manifest.ts exists without cap.meta.ts — legacy artifact
      reportedDirs.add(dir);
      context.report({
        loc: { line: 1, column: 0 },
        messageId: 'legacyManifest',
        data: { dir },
      });
    }

    return {};
  },
};

export default rule;
