// ESLint rule: no-cap-logic-missing
// Filesystem rule: if cap.meta.ts/cap.meta.js exists in a .cap/ directory, cap.ts/cap.js must also exist

import type { Rule } from 'eslint';
import * as fs from 'fs';
import * as path from 'path';

const META_FILE_RE = /^cap\.meta\.(ts|js|mjs|cjs)$/;

function getCapPath(metaFilePath: string): string {
  const dir = path.dirname(metaFilePath);
  const match = path.basename(metaFilePath).match(/^cap\.meta\.(ts|js|mjs|cjs)$/);
  if (!match) return '';
  return path.join(dir, `cap.${match[1]}`);
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require cap.ts alongside cap.meta.ts in .cap/ directories' },
    messages: {
      missingLogic: 'cap.meta.ts exists in a .cap/ directory but cap.ts is missing',
    },
  },
  create(context) {
    const filename = context.filename;
    const base = path.basename(filename);
    if (!META_FILE_RE.test(base)) return {};

    const dir = path.dirname(filename);
    const dirName = path.basename(dir);
    if (!dirName.endsWith('.cap')) return {};

    const capPath = getCapPath(filename);
    if (capPath && !fs.existsSync(capPath)) {
      context.report({
        node: context.sourceCode.ast,
        messageId: 'missingLogic',
      });
    }

    return {};
  },
};

export { rule };
export default rule;
