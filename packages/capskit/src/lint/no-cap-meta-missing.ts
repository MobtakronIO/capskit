// ESLint rule: no-cap-meta-missing
// Filesystem rule: if cap.ts/cap.js exists in a .cap/ directory, cap.meta.ts/cap.meta.js must also exist

import type { Rule } from 'eslint';
import * as fs from 'fs';
import * as path from 'path';

const CAP_FILE_RE = /^cap\.(ts|js|mjs|cjs)$/;
const META_FILE_RE = /^cap\.meta\.(ts|js|mjs|cjs)$/;

function getMetaPath(capFilePath: string): string {
  const dir = path.dirname(capFilePath);
  const base = path.basename(capFilePath);
  const match = base.match(/^cap\.(ts|js|mjs|cjs)$/);
  if (!match) return '';
  return path.join(dir, `cap.meta.${match[1]}`);
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require cap.meta.ts alongside cap.ts in .cap/ directories' },
    messages: {
      missingMeta: 'cap.ts exists in a .cap/ directory but cap.meta.ts is missing',
    },
  },
  create(context) {
    const filename = context.filename;
    const base = path.basename(filename);
    if (!CAP_FILE_RE.test(base)) return {};

    const dir = path.dirname(filename);
    // Check if inside a .cap directory
    const dirName = path.basename(dir);
    if (!dirName.endsWith('.cap')) return {};

    const metaPath = getMetaPath(filename);
    if (metaPath && !fs.existsSync(metaPath)) {
      context.report({
        node: context.sourceCode.ast,
        messageId: 'missingMeta',
      });
    }

    return {};
  },
};

export { rule };
export default rule;
