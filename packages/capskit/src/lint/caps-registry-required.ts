/**
 * ESLint rule: @capskit/caps-registry-required
 *
 * Validates that any directory containing .cap subdirectories also has a
 * caps.ts (or caps.js) file at its root. The caps.ts file exports a
 * CapsuleRegistry that composes the caps together.
 *
 * Without caps.ts, individual .cap directories are not discoverable by
 * the kernel unless loaded via `cap-directories` format (which lacks
 * the explicit composition and ordering guarantees of caps-registry).
 *
 * @example
 * // ❌ Error — missing caps.ts
 * // Directory: capsules/calculator/
 * //   sum.cap/
 * //     cap.ts
 * //     cap.meta.ts
 * //   multiply.cap/
 * //     cap.ts
 * //     cap.meta.ts
 * //   caps.ts     ✗ MISSING
 *
 * // ✅ OK
 * // Directory: capsules/calculator/
 * //   sum.cap/
 * //     cap.ts
 * //     cap.meta.ts
 * //   multiply.cap/
 * //     cap.ts
 * //     cap.meta.ts
 * //   caps.ts     ✓ (exports CapsuleRegistry)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Rule } from 'eslint';

const RULE_NAME = '@capskit/caps-registry-required';
const CAPS_FILE_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];

// Track directories already reported to avoid duplicate errors
const reportedDirs = new Set<string>();

/**
 * Check if a directory contains any .cap subdirectories.
 */
function hasCapSubdirectories(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) {
    return false;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some(
    (entry) => entry.isDirectory() && entry.name.endsWith('.cap'),
  );
}

/**
 * Check if a caps.{ts,js,mjs,cjs} file exists in the directory.
 */
function hasCapsFile(dirPath: string): boolean {
  return CAPS_FILE_EXTENSIONS.some((ext) =>
    fs.existsSync(path.join(dirPath, `caps${ext}`)),
  );
}

export const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require caps.ts in every capsule directory that contains .cap subdirectories',
      recommended: 'error',
      url: 'https://capskit.dev/guide/capsules#capsuleregistry',
    },
    schema: [
      {
        type: 'object',
        properties: {
          /**
           * Capsule directories that are exempt from the caps.ts requirement.
           * Use this for directories that use cap-directories format intentionally.
           *
           * @default []
           */
          allowDirectories: {
            type: 'array',
            items: { type: 'string' },
            default: [],
            description:
              'Directory names that are allowed to use cap-directories format (no caps.ts required)',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingRegistry:
        'Missing caps.ts in capsule directory "{{ dir }}". ' +
        'A directory containing .cap subdirectories should have a caps.ts at its root ' +
        'exporting a CapsuleRegistry. See: https://capskit.dev/guide/capsules#capsuleregistry',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allowDirectories = new Set(options.allowDirectories || []);

    const filename = context.filename || (context as any).getFilename?.() || '';
    const dir = path.dirname(filename);
    const parentDirName = path.basename(dir);
    const basename = path.basename(filename);

    // Skip files inside .cap directories themselves — those are checked by
    // no-cap-meta-missing and no-cap-logic-missing rules
    if (parentDirName.endsWith('.cap')) {
      return {};
    }

    // If the file is already caps.ts, it's fine — no need to report
    if (/^caps\.(ts|js|mjs|cjs)$/.test(basename)) {
      return {};
    }

    // Deduplicate: only analyze each directory once
    if (reportedDirs.has(dir)) {
      return {};
    }

    // Skip if this directory is in the allow list
    if (allowDirectories.has(parentDirName) || allowDirectories.has(dir)) {
      return {};
    }

    // Check: does this directory have .cap subdirectories?
    if (!hasCapSubdirectories(dir)) {
      return {};
    }

    // Check: does this directory have a caps.ts file?
    if (hasCapsFile(dir)) {
      return {};
    }

    reportedDirs.add(dir);

    context.report({
      loc: { line: 1, column: 0 },
      messageId: 'missingRegistry',
      data: { dir },
    });

    return {};
  },
};

export default rule;
