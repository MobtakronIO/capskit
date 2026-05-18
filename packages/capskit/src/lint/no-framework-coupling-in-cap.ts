// ESLint rule: no-framework-coupling-in-cap
// AST rule: disallow framework imports inside cap.ts files within .cap directories

import type { Rule } from 'eslint';

const FRAMEWORK_MODULES = [
  'elysia', 'express', 'fastify', 'hono', 'koa', 'nest', '@nestjs/core',
  'restify', 'polka', 'micro', 'sapper', 'sveltekit', 'next', 'remix',
];

const ADAPTER_PATTERNS = ['@mobtakronio/', '@capskit/adapter'];

interface RuleOptions {
  allowList?: string[];
}

function isInsideCapDirectory(filename: string): boolean {
  const parts = filename.replace(/\\/g, '/').split('/');
  return parts.some(p => p.endsWith('.cap'));
}

function isCapFile(filename: string): boolean {
  const base = filename.replace(/\\/g, '/').split('/').pop() || '';
  return /^cap\.(ts|js|mjs|cjs)$/.test(base) && isInsideCapDirectory(filename);
}

function isFrameworkModule(source: string): boolean {
  return FRAMEWORK_MODULES.some(fw => source === fw || source.startsWith(`${fw}/`));
}

function isAdapterModule(source: string): boolean {
  return ADAPTER_PATTERNS.some(p => source.startsWith(p));
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow framework imports inside cap.ts files' },
    messages: {
      frameworkImport: 'Framework import "{{importSource}}" is not allowed in {{file}}. Caps should be framework-agnostic.',
      adapterImport: 'Adapter import "{{importSource}}" is not allowed in {{file}}. Caps should be framework-agnostic.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowList: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = context.filename;
    if (!isCapFile(filename)) return {};

    const options = (context.options?.[0] || {}) as RuleOptions;
    const allowList: string[] = options.allowList || [];

    function reportIfBanned(source: string, node: any) {
      if (allowList.some(allowed => source === allowed || source.startsWith(`${allowed}/`))) return;

      if (isAdapterModule(source)) {
        context.report({ node, messageId: 'adapterImport', data: { importSource: source, file: filename } });
      } else if (isFrameworkModule(source)) {
        context.report({ node, messageId: 'frameworkImport', data: { importSource: source, file: filename } });
      }
    }

    return {
      ImportDeclaration(node: any) {
        const source = node.source.value;
        if (typeof source === 'string') reportIfBanned(source, node);
      },
      ImportExpression(node: any) {
        // Dynamic import: await import('elysia')
        const arg = node.source;
        if (arg.type === 'Literal' && typeof arg.value === 'string') {
          reportIfBanned(arg.value, node);
        }
      },
      CallExpression(node: any) {
        // require() calls
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'Literal' &&
          typeof node.arguments[0].value === 'string'
        ) {
          reportIfBanned(node.arguments[0].value, node);
        }
      },
    };
  },
};

export { rule };
export default rule;
