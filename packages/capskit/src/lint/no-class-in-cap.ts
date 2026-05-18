import type { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Prevent class declarations, class expressions, and class instantiation in .cap.ts files' },
    messages: {
      declaration: 'Use functions, not classes, in .cap.ts files',
      expression: 'Use functions, not class expressions, in .cap.ts files',
      instantiation: 'Do not instantiate classes with "new" in .cap.ts files',
    },
  },
  create(context) {
    if (!context.filename.endsWith('.cap.ts')) return {};

    return {
      ClassDeclaration(node) {
        context.report({ node, messageId: 'declaration' });
      },
      ClassExpression(node) {
        context.report({ node, messageId: 'expression' });
      },
      NewExpression(node) {
        context.report({ node, messageId: 'instantiation' });
      },
    };
  },
};

export default rule;
