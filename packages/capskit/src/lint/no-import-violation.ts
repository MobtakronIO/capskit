import type { Rule } from 'eslint';

// Dependency pyramid — each layer may only import from layers listed below it:
// .cap.ts         → .rule.ts, .helper.ts, .repository.ts, .type.ts, .error.ts, .constant.ts
// .rule.ts        → .helper.ts, .type.ts, .error.ts, .constant.ts
// .helper.ts      → .type.ts, .error.ts, .constant.ts
// .repository.ts  → .type.ts, .error.ts, .constant.ts
// .type.ts        → .error.ts, .constant.ts
// .error.ts       → .type.ts, .constant.ts
// .constant.ts    → .type.ts, .error.ts

const ALLOWED_IMPORTS: Record<string, string[]> = {
  '.cap.ts': ['.rule.ts', '.helper.ts', '.repository.ts', '.type.ts', '.error.ts', '.constant.ts'],
  '.rule.ts': ['.helper.ts', '.type.ts', '.error.ts', '.constant.ts'],
  '.helper.ts': ['.type.ts', '.error.ts', '.constant.ts'],
  '.repository.ts': ['.type.ts', '.error.ts', '.constant.ts'],
  '.type.ts': ['.error.ts', '.constant.ts'],
  '.error.ts': ['.type.ts', '.constant.ts'],
  '.constant.ts': ['.type.ts', '.error.ts'],
};

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce capsule dependency pyramid rules' },
    messages: { violation: 'Import violation: {{from}} cannot import from {{to}}' },
  },
  create(context) {
    const filename = context.filename;
    const suffix = Object.keys(ALLOWED_IMPORTS).find(s => filename.endsWith(s));
    if (!suffix) return {};

    const allowed = ALLOWED_IMPORTS[suffix];

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string' || !source.startsWith('.')) return;

        // Check if the import targets a restricted capsule layer
        const targetSuffix = Object.keys(ALLOWED_IMPORTS).find(s => source.includes(s));
        if (targetSuffix && !allowed.includes(targetSuffix)) {
          context.report({
            node,
            messageId: 'violation',
            data: { from: suffix, to: source },
          });
        }
      },
    };
  },
};

export default rule;
