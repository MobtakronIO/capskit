import type { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Prevent .cap.ts files from importing other .cap.ts files' },
    messages: { import: 'Cap files must not import other cap files. Use ctx.call() or ctx.emit() for cross-cap communication.' },
  },
  create(context) {
    const filename = context.filename;
    if (!filename.endsWith('.cap.ts')) return {};

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source === 'string' && source.includes('.cap')) {
          context.report({ node, messageId: 'import' });
        }
      },
    };
  },
};

export default rule;
