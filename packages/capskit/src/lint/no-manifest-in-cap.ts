// ESLint rule: no-manifest-in-cap
// Filesystem rule: no manifest.ts inside .cap/ directories

import type { Rule } from 'eslint';
import * as fs from 'fs';
import * as path from 'path';

interface RuleOptions {
  alwaysError?: boolean;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow manifest.ts files inside .cap/ directories' },
    messages: {
      duplicateMetadata: 'manifest.ts and cap.meta.ts both exist in a .cap/ directory; use cap.meta.ts only',
      legacyManifest: 'manifest.ts is deprecated in .cap/ directories; use cap.meta.ts instead',
    },
    schema: [
      {
        type: 'object',
        properties: {
          alwaysError: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    const base = path.basename(filename);
    if (!/^manifest\.(ts|js|mjs)$/.test(base)) return {};

    const dir = path.dirname(filename);
    const dirName = path.basename(dir);
    if (!dirName.endsWith('.cap')) return {};

    const options = (context.options?.[0] || {}) as RuleOptions;
    const alwaysError = options.alwaysError !== false; // default true

    // Check if cap.meta.ts/cap.meta.js also exists in the same directory
    const hasMeta = fs.existsSync(path.join(dir, 'cap.meta.ts')) || fs.existsSync(path.join(dir, 'cap.meta.js'));

    if (hasMeta) {
      // Both exist - always an error
      context.report({
        node: context.sourceCode.ast,
        messageId: 'duplicateMetadata',
      });
    } else if (alwaysError) {
      // Only manifest exists, and alwaysError is true
      context.report({
        node: context.sourceCode.ast,
        messageId: 'legacyManifest',
      });
    }
    // If alwaysError is false and no cap.meta.ts, it's allowed

    return {};
  },
};

export { rule };
export default rule;
