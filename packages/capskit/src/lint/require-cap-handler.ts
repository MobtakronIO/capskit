import type { Rule, SourceCode } from 'eslint';

function hasDefaultExport(sourceCode: SourceCode): boolean {
  const ast = sourceCode.ast;

  for (const node of ast.body) {
    // export default function / export default expression
    if (node.type === 'ExportDefaultDeclaration') {
      return true;
    }
    // export { something as default }
    if (node.type === 'ExportNamedDeclaration') {
      for (const spec of node.specifiers) {
        if (spec.type === 'ExportSpecifier' && spec.exported.type === 'Identifier' && spec.exported.name === 'default') {
          return true;
        }
      }
    }
  }

  return false;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require every .cap.ts file to have a default export (the handler)' },
    messages: { missing: '.cap.ts file must have a default export (the handler function)' },
  },
  create(context) {
    if (!context.filename.endsWith('.cap.ts')) return {};

    if (!hasDefaultExport(context.sourceCode)) {
      context.report({
        node: context.sourceCode.ast,
        messageId: 'missing',
      });
    }

    return {};
  },
};

export default rule;
