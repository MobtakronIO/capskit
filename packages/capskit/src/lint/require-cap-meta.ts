import type { Rule, SourceCode } from 'eslint';

function hasNamedMetaExport(sourceCode: SourceCode): boolean {
  const ast = sourceCode.ast;

  for (const node of ast.body) {
    if (node.type === 'ExportNamedDeclaration') {
      // export const meta = ...
      if (node.declaration?.type === 'VariableDeclaration') {
        for (const decl of node.declaration.declarations) {
          if (decl.id.type === 'Identifier' && decl.id.name === 'meta') {
            return true;
          }
        }
      }
      // export { meta } or export { something as meta }
      for (const spec of node.specifiers) {
        if (spec.type === 'ExportSpecifier' && spec.exported.type === 'Identifier' && spec.exported.name === 'meta') {
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
    docs: { description: 'Require every .cap.ts file to export a named "meta" export' },
    messages: { missing: '.cap.ts file must export a named "meta" object' },
  },
  create(context) {
    if (!context.filename.endsWith('.cap.ts')) return {};

    if (!hasNamedMetaExport(context.sourceCode)) {
      context.report({
        node: context.sourceCode.ast,
        messageId: 'missing',
      });
    }

    return {};
  },
};

export default rule;
