// ESLint rule: caps-registry-required
// Filesystem rule: if a directory contains .cap subdirectories, it must have a caps.ts

import type { Rule } from 'eslint';
import * as fs from 'fs';
import * as path from 'path';

function findCapDirectory(filePath: string): string | null {
  let current = path.dirname(filePath);
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break; // reached root
    if (path.basename(current).endsWith('.cap')) return current;
    current = parent;
  }
  return null;
}

function getAncestorDirWithCapDirs(filePath: string): string | null {
  let current = path.dirname(filePath);
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break;
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      const hasCapDirs = entries.some(e => e.isDirectory() && e.name.endsWith('.cap'));
      if (hasCapDirs) return current;
    } catch {
      // ignore
    }
    current = parent;
  }
  return null;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require caps.ts in directories that contain .cap subdirectories' },
    messages: {
      missingRegistry: 'Directory contains .cap subdirectories but is missing a caps.ts registry file',
    },
  },
  create(context) {
    const filename = context.filename || context.getFilename();

    // Skip files inside .cap directories (other rules handle those)
    const capDir = findCapDirectory(filename);
    if (capDir) return {};

    // Skip caps.ts files themselves
    if (path.basename(filename) === 'caps.ts' || path.basename(filename) === 'caps.js') return {};

    // Find the nearest ancestor directory that has .cap subdirectories
    const ancestorWithCaps = getAncestorDirWithCapDirs(filename);
    if (!ancestorWithCaps) return {};

    // Check if that directory has a caps.ts or caps.js
    const hasRegistry =
      fs.existsSync(path.join(ancestorWithCaps, 'caps.ts')) ||
      fs.existsSync(path.join(ancestorWithCaps, 'caps.js')) ||
      fs.existsSync(path.join(ancestorWithCaps, 'caps.mjs'));

    if (!hasRegistry) {
      context.report({
        node: context.sourceCode.ast,
        messageId: 'missingRegistry',
      });
    }

    return {};
  },
};

export { rule };
export default rule;
