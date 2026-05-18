import type { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Prevent index signatures like [action: string]: any' },
    messages: { index: 'Index signatures like [key: string]: any are not allowed. Use explicit types.' },
  },
  create(context: Rule.RuleContext) {
    return {
      TSIndexSignature(node: unknown) {
        context.report({ node: node as never, messageId: 'index' });
      },
    };
  },
};

export default rule;
