// ESLint rule: no-direct-call
// Detects direct calls to capskit.call() in user-land code

import type { Rule } from 'eslint';

const DEFAULT_ALLOW_LIST = ['system', 'http', 'websocket'];
const DEFAULT_ALLOW_IN_CONTEXT = ['ctx'];

interface RuleOptions {
  allowList?: string[];
  allowInContext?: string[];
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow direct capskit.call() in user-land code; use capskit.use() instead' },
    messages: {
      directCall: 'Do not call capskit.call() directly. Use capskit.use({{capsule}}).{{action}}() instead.',
      directCallWithSuggestion: 'Replace capskit.call() with capskit.use({{capsule}}).{{action}}()',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allowList: { type: 'array', items: { type: 'string' } },
          allowInContext: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = (context.options?.[0] || {}) as RuleOptions;
    const allowList = options.allowList ?? DEFAULT_ALLOW_LIST;
    const allowInContext = options.allowInContext ?? DEFAULT_ALLOW_IN_CONTEXT;
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node: any) {
        const callee = node.callee;

        // Match capskit.call(...)
        if (
          callee.type !== 'MemberExpression' ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'call' ||
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'capskit'
        ) {
          return;
        }

        // Check if called on a nested object like capskit.config.call(this)
        if (callee.object.type === 'MemberExpression') return;

        const args = node.arguments;

        // Ignore if no arguments
        if (!args || args.length === 0) return;

        const firstArg = args[0];

        // Ignore if first arg is not a string literal or template literal
        let actionName: string | undefined;
        if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
          actionName = firstArg.value;
        } else if (firstArg.type === 'TemplateLiteral' && firstArg.quasis.length === 1 && !firstArg.expressions.length) {
          actionName = firstArg.quasis[0].value.cooked;
        }

        // If we can't determine the action name, ignore
        if (!actionName) return;

        // Ignore if action name doesn't contain a dot (can't split capsule.action)
        if (!actionName.includes('.')) return;

        const [capsule, action] = actionName.split('.');

        // Allow if capsule is in the allowList
        if (allowList.includes(capsule)) return;

        const secondArg = args[1];
        const payload = secondArg ? sourceCode.getText(secondArg) : '{}';
        const fixedCode = `capskit.use('${capsule}').${action}(${payload})`;

        context.report({
          node,
          messageId: 'directCall',
          data: { action, capsule },
          suggest: [
            {
              messageId: 'directCallWithSuggestion',
              data: { capsule, action },
              fix(fixer) {
                return fixer.replaceText(node, fixedCode);
              },
            },
          ],
        });
      },
    };
  },
};

export { rule };
export default rule;
