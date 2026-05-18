import type { Rule } from 'eslint';

const MAX_STEPS = 4;

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce max 4 distinct sequential steps in .cap.ts files to prevent god caps' },
    messages: {
      exceeded: 'Cap file "{{file}}" has {{steps}} distinct steps (max {{max}}). Extract steps to .helper.ts, .rule.ts, or .repository.ts.',
    },
  },
  create(context) {
    const filename = context.filename;
    if (!filename.endsWith('.cap.ts')) return {};

    return {
      ExportDefaultDeclaration(node) {
        const decl = node.declaration as unknown as Record<string, unknown> | undefined;
        let fnBody: { body: unknown[] } | undefined;

        if (decl?.type === 'FunctionDeclaration') {
          fnBody = decl.body as { body: unknown[] };
        } else if (decl?.type === 'ArrowFunctionExpression' && (decl.body as { type?: string })?.type === 'BlockStatement') {
          fnBody = decl.body as { body: unknown[] };
        } else if (decl?.type === 'FunctionExpression') {
          fnBody = decl.body as { body: unknown[] };
        }

        if (!fnBody) return;

        const stepCount = countSteps(fnBody.body);

        if (stepCount > MAX_STEPS) {
          context.report({
            node,
            messageId: 'exceeded',
            data: { file: filename, steps: String(stepCount), max: String(MAX_STEPS) },
          });
        }
      },
    };
  },
};

function countSteps(body: unknown[]): number {
  let steps = 0;
  for (const stmt of body) {
    if (isStep(stmt)) {
      steps++;
    }
  }
  return steps;
}

function isStep(stmt: unknown): boolean {
  const s = stmt as { type?: string };
  switch (s.type) {
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'IfStatement':
    case 'SwitchStatement':
    case 'TryStatement':
      return true;

    case 'ExpressionStatement': {
      const expr = (s as unknown as Record<string, unknown>).expression as { type?: string };
      return expressionDoesWork(expr);
    }

    case 'VariableDeclaration': {
      const decls = (s as unknown as Record<string, unknown>).declarations as Array<{ init?: { type?: string } }>;
      return decls.some(d => d.init && initializerDoesWork(d.init));
    }

    case 'ReturnStatement':
      return false;

    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSDeclareFunction':
      return false;

    default:
      return true;
  }
}

function expressionDoesWork(expr: { type?: string }): boolean {
  switch (expr.type) {
    case 'CallExpression':
    case 'NewExpression':
    case 'AwaitExpression':
    case 'SequenceExpression':
    case 'YieldExpression':
    case 'TaggedTemplateExpression':
      return true;
    case 'UpdateExpression':
    case 'AssignmentExpression': {
      const right = (expr as unknown as Record<string, unknown>).right as { type?: string } | undefined;
      return right ? initializerDoesWork(right) : false;
    }
    case 'Literal':
    case 'Identifier':
    case 'MemberExpression':
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'TemplateLiteral':
    case 'BinaryExpression':
    case 'UnaryExpression':
    case 'LogicalExpression':
    case 'ConditionalExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return false;
    default:
      return true;
  }
}

function initializerDoesWork(expr: { type?: string } | null | undefined): boolean {
  if (!expr) return false;

  switch (expr.type) {
    case 'CallExpression':
    case 'NewExpression':
    case 'AwaitExpression':
      return true;
    case 'ObjectExpression': {
      const props = (expr as unknown as Record<string, unknown>).properties as Array<{ type?: string; value?: { type?: string } }>;
      return props.some(p => p.type === 'Property' && p.value && initializerDoesWork(p.value));
    }
    case 'ArrayExpression': {
      const elems = (expr as unknown as Record<string, unknown>).elements as Array<{ type?: string } | null>;
      return elems.some(e => initializerDoesWork(e));
    }
    case 'Literal':
    case 'Identifier':
    case 'MemberExpression':
    case 'TemplateLiteral':
    case 'BinaryExpression':
    case 'UnaryExpression':
    case 'LogicalExpression':
    case 'ConditionalExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return false;
    default:
      return true;
  }
}

export default rule;
