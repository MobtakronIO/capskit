import type { Rule } from 'eslint';

const BANNED_FILENAMES = ['utils.ts', 'utils.tsx', 'shared.ts', 'shared.tsx', 'common.ts', 'common.tsx'];

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban vague file names like utils.ts, shared.ts, common.ts' },
    messages: { banned: 'File name "{{name}}" is banned. Use specific, descriptive file names.' },
  },
  create(context) {
    const filename = context.filename;
    const basename = filename.split('/').pop() || '';
    if (BANNED_FILENAMES.includes(basename)) {
      context.report({
        loc: { line: 1, column: 0 },
        messageId: 'banned',
        data: { name: basename },
      });
    }
    return {};
  },
};

export default rule;
