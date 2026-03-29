/**
 * ESLint rule: @capskit/no-direct-call
 * 
 * Flags direct usage of `capskit.call(actionName, payload)` in application code,
 * encouraging the use of `capskit.use('capsule').action(payload)` instead.
 * 
 * This rule helps steer users toward the public API and away from the internal API.
 * 
 * @example
 * // ❌ Disallowed
 * capskit.call('users.create', { email: 'test@example.com' });
 * 
 * // ✅ Allowed
 * const users = capskit.use('users');
 * await users.create({ email: 'test@example.com' });
 */

import type { Rule } from 'eslint';
import type { CallExpression, MemberExpression, Identifier } from 'estree';

const RULE_NAME = '@capskit/no-direct-call';
const CALL_METHOD_NAME = 'call';

export const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct `capskit.call()` usage in application code',
      recommended: 'warn',
      url: 'https://capskit.dev/guide/api-usage#prefer-use-over-call',
    },
    schema: [
      {
        type: 'object',
        properties: {
          /**
           * Capsule names that are allowed to use direct call().
           * Use this for internal/system capsules that need direct access.
           * 
           * @default ['system', 'http', 'websocket']
           */
          allowList: {
            type: 'array',
            items: { type: 'string' },
            default: ['system', 'http', 'websocket'],
          },
          /**
           * Variable names that are whitelisted as internal.
           * By default, we flag `capskit.call()` but allow `ctx.call()` in action handlers
           * since context.call is the appropriate pattern there.
           * 
           * @default []
           */
          allowInContext: {
            type: 'array',
            items: { type: 'string' },
            default: [],
            description: 'Allow call() on these variable names (e.g., ["ctx"] for action handlers)',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      directCall: `Avoid using \`capskit.call('{{ action }}', ...)\`. ` +
        `Use \`capskit.use('{{ capsule }}').{{ action }}(...)\` instead for better type safety and IDE support.`,
      directCallWithSuggestion: `Replace \`capskit.call('{{ capsule }}.{{ action }}', payload)\` with ` + 
        `\`capsule.{{ action }}(payload)\` where \`capsule = capskit.use('{{ capsule }}')\`.`,
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const allowList = new Set(options.allowList || ['system', 'http', 'websocket']);
    const allowInContext = new Set(['ctx', ...(options.allowInContext || [])]);

    /**
     * Check if a member expression is `something.call`
     */
    function isDirectCallMember(node: MemberExpression): boolean {
      return (
        node.property.type === 'Identifier' &&
        node.property.name === CALL_METHOD_NAME
      );
    }

    /**
     * Check if a callee is a direct `capskit.call` pattern
     */
    function getCallInfo(node: CallExpression): { capsule: string; action: string } | null {
      const callee = node.callee;

      // Handle `capskit.call('actionName', payload)` where actionName is a string
      if (
        callee.type === 'MemberExpression' &&
        isDirectCallMember(callee) &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'capskit'
      ) {
        // Get the action name from the first argument
        const actionArg = node.arguments[0];
        if (
          actionArg &&
          (actionArg.type === 'Literal' || actionArg.type === 'TemplateLiteral')
        ) {
          const actionName = actionArg.type === 'Literal' 
            ? String(actionArg.value) 
            : (actionArg.quasis?.[0]?.value?.cooked || '');
          
          if (actionName && actionName.includes('.')) {
            const [capsule, action] = actionName.split('.');
            return { capsule, action };
          }
        }
      }

      return null;
    }

    /**
     * Check if the call is made on an allowed context (e.g., ctx.call)
     */
    function isAllowedContext(node: MemberExpression): boolean {
      if (node.object.type === 'Identifier') {
        return allowInContext.has(node.object.name);
      }
      return false;
    }

    return {
      CallExpression(node) {
        const callee = node.callee;

        // Check if this is a `capskit.call(...)` pattern
        if (callee.type !== 'MemberExpression') return;
        if (!isDirectCallMember(callee)) return;
        
        // Allow `ctx.call()` and similar context patterns
        if (isAllowedContext(callee)) return;

        const info = getCallInfo(node);
        if (!info) return;

        // Check if the capsule is in the allow list
        if (allowList.has(info.capsule)) return;

        context.report({
          node,
          messageId: 'directCall',
          data: {
            action: info.action,
            capsule: info.capsule,
          },
          suggest: [
            {
              messageId: 'directCallWithSuggestion',
              data: {
                capsule: info.capsule,
                action: info.action,
              },
              fix(fixer) {
                const actionArg = node.arguments[0];
                const payloadArg = node.arguments[1];
                
                if (!actionArg || !payloadArg) return null;

                const actionStart = actionArg.range ? actionArg.range[0] : 0;
                const actionEnd = actionArg.range ? actionArg.range[1] : 0;
                const payloadStart = payloadArg.range ? payloadArg.range[0] : 0;
                const payloadEnd = payloadArg.range ? payloadArg.range[1] : 0;

                const sourceCode = context.sourceCode;
                const payloadText = sourceCode.text.slice(payloadStart, payloadEnd);

                return fixer.replaceText(
                  node,
                  `capskit.use('${info.capsule}').${info.action}(${payloadText})`
                );
              },
            },
          ],
        });
      },
    };
  },
};

export default rule;
