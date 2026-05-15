/**
 * ESLint rule: @capskit/no-framework-coupling-in-cap
 *
 * Detects framework-specific imports inside `cap.ts` files within `.cap/`
 * directories.  Caps should contain pure business logic — framework coupling
 * belongs in adapters (e.g., `@mobtakronio/capskit-http-elysia`).
 *
 * This rule scans the import declarations of `cap.ts` (or `cap.js`) files
 * and flags any import from a known web-framework package or a capsKit
 * adapter package.
 *
 * @example
 * // ❌ Error — framework import in cap.ts
 * // File: users.cap/cap.ts
 * import { Elysia } from 'elysia';           // ✗ direct framework import
 * import { createRouter } from 'express';    // ✗ direct framework import
 *
 * // ✅ OK — pure business logic
 * // File: users.cap/cap.ts
 * import { ActionInput, CapContext } from '../../../types';
 * import { UserRepository } from '../repositories/user';
 *
 * export default class UsersCap {
 *   [action: string]: any;
 *   async create(input: ActionInput, ctx: CapContext) { ... }
 * }
 */

import * as path from 'path';
import type { Rule } from 'eslint';

const CAP_FILE_PATTERN = /^cap\.(ts|js|mjs|cjs)$/;

/**
 * Framework packages whose imports are banned inside cap.ts files.
 *
 * These are split into two categories:
 * - core frameworks: the HTTP/WS server libraries themselves
 * - capsKit adapter packages: internal coupling to specific framework adapters
 */
const BANNED_FRAMEWORK_PACKAGES = new Set([
  // Core HTTP frameworks
  'elysia',
  'express',
  'fastify',
  'koa',
  'hono',
  'hapi',
  '@hapi/hapi',
  'restify',
  'polka',
  'micro',

  // Type packages for frameworks
  '@types/express',
  '@types/koa',

  // Routing / middleware helpers that indicate framework coupling
  '@elysiajs/cors',
  '@elysiajs/jwt',
  '@elysiajs/swagger',
  '@elysiajs/static',
  '@elysiajs/html',
  '@elysiajs/bearer',

  // Express middleware packages
  'cors',
  'helmet',
  'morgan',
  'body-parser',
  'compression',
]);

/**
 * CapsKit adapter packages that couple a cap to a specific framework.
 * These should be used only in bootstrapping code, not inside cap.ts.
 */
const BANNED_CAPSKIT_ADAPTER_PACKAGES = new Set([
  '@mobtakronio/capskit-http-elysia',
  '@mobtakronio/capskit-websocket-elysia',
  '@mobtakronio/elysia',
]);

/**
 * CapsKit internal kernel modules that indicate adapter/route-level concern
 * rather than pure business logic.  If a cap.ts is importing adapter-validation
 * or version-checking, it is likely doing framework coupling work.
 */
const SUSPICIOUS_INTERNAL_IMPORTS = [
  'adapter-validation',
  'kernel/adapter-validation',
];

export const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow framework-specific imports in cap.ts files inside .cap directories',
      recommended: 'error',
      url: 'https://capskit.dev/guide/capsules#cap-purity',
    },
    schema: [
      {
        type: 'object',
        properties: {
          /**
           * Additional packages to treat as banned framework imports.
           * Useful when your project has custom framework adapters.
           *
           * @default []
           */
          additionalBannedPackages: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
          /**
           * Packages to allow even though they'd normally be banned.
           * Use this sparingly — only for legitimate cases where a
           * framework import is necessary in a cap (e.g., type-only imports).
           *
           * @default []
           */
          allowList: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
          /**
           * When true, also flag imports from capsKit internal modules
           * (e.g., adapter-validation, version) that suggest
           * framework-coupling concern.
           *
           * @default true
           */
          flagSuspiciousInternals: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      frameworkImport:
        'Framework import "{{ importSource }}" found in cap.ts "{{ file }}". ' +
        'Caps should contain pure business logic. Framework coupling belongs in adapters. ' +
        'See: https://capskit.dev/guide/capsules#cap-purity',
      adapterImport:
        'CapsKit adapter import "{{ importSource }}" found in cap.ts "{{ file }}". ' +
        'Adapters should be wired at the boot layer, not imported inside cap.ts. ' +
        'See: https://capskit.dev/guide/capsules#cap-purity',
      suspiciousInternalImport:
        'Suspicious internal import "{{ importSource }}" in cap.ts "{{ file }}". ' +
        'This module is related to adapter/routing concerns that belong outside caps. ' +
        'Consider moving this logic to the boot layer or an adapter.',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const additionalBanned = new Set(options.additionalBannedPackages || []);
    const allowList = new Set(options.allowList || []);
    const flagSuspiciousInternals =
      options.flagSuspiciousInternals !== undefined
        ? options.flagSuspiciousInternals
        : true;

    const filename = context.filename || (context as any).getFilename?.() || '';
    const basename = path.basename(filename);
    const dir = path.dirname(filename);

    // Only run on cap.{ts,js,mjs,cjs} files
    if (!CAP_FILE_PATTERN.test(basename)) {
      return {};
    }

    // Only relevant inside a .cap directory
    const parentDirName = path.basename(dir);
    if (!parentDirName.endsWith('.cap')) {
      return {};
    }

    /**
     * Check whether the import source is a banned framework package.
     */
    function isBannedPackage(importSource: string): boolean {
      // Direct match
      if (BANNED_FRAMEWORK_PACKAGES.has(importSource)) return true;
      if (BANNED_CAPSKIT_ADAPTER_PACKAGES.has(importSource)) return true;
      if (additionalBanned.has(importSource)) return true;

      // Also catch sub-path imports from banned packages
      // e.g. 'elysia/some-submodule'
      for (const pkg of BANNED_FRAMEWORK_PACKAGES) {
        if (importSource === pkg || importSource.startsWith(pkg + '/')) {
          if (!allowList.has(importSource) && !allowList.has(pkg)) {
            return true;
          }
        }
      }
      for (const pkg of BANNED_CAPSKIT_ADAPTER_PACKAGES) {
        if (importSource === pkg || importSource.startsWith(pkg + '/')) {
          if (!allowList.has(importSource) && !allowList.has(pkg)) {
            return true;
          }
        }
      }
      for (const pkg of additionalBanned) {
        if (importSource === pkg || importSource.startsWith(pkg + '/')) {
          if (!allowList.has(importSource) && !allowList.has(pkg)) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Check whether the import source is a suspicious capsKit internal
     * module that suggests framework/route coupling.
     */
    function isSuspiciousInternal(importSource: string): boolean {
      if (!flagSuspiciousInternals) return false;
      return SUSPICIOUS_INTERNAL_IMPORTS.some(
        (suspicious) =>
          importSource === suspicious || importSource.endsWith('/' + suspicious),
      );
    }

    /**
     * Determine whether a banned import is a capsKit adapter package
     * (to produce a more specific error message).
     */
    function isAdapterPackage(importSource: string): boolean {
      return BANNED_CAPSKIT_ADAPTER_PACKAGES.has(importSource) ||
        [...BANNED_CAPSKIT_ADAPTER_PACKAGES].some(
          (pkg) => importSource.startsWith(pkg + '/'),
        );
    }

    return {
      ImportDeclaration(node) {
        const importSource = node.source.value as string;

        if (allowList.has(importSource)) {
          return;
        }

        if (isAdapterPackage(importSource)) {
          context.report({
            node,
            messageId: 'adapterImport',
            data: { importSource, file: filename },
          });
          return;
        }

        if (isBannedPackage(importSource)) {
          context.report({
            node,
            messageId: 'frameworkImport',
            data: { importSource, file: filename },
          });
          return;
        }

        if (isSuspiciousInternal(importSource)) {
          context.report({
            node,
            messageId: 'suspiciousInternalImport',
            data: { importSource, file: filename },
          });
        }
      },

      // Also check dynamic imports like `await import('elysia')`
      ImportExpression(node) {
        if (node.source.type === 'Literal') {
          const importSource = node.source.value as string;

          if (allowList.has(importSource)) {
            return;
          }

          if (isAdapterPackage(importSource)) {
            context.report({
              node,
              messageId: 'adapterImport',
              data: { importSource, file: filename },
            });
            return;
          }

          if (isBannedPackage(importSource)) {
            context.report({
              node,
              messageId: 'frameworkImport',
              data: { importSource, file: filename },
            });
            return;
          }

          if (isSuspiciousInternal(importSource)) {
            context.report({
              node,
              messageId: 'suspiciousInternalImport',
              data: { importSource, file: filename },
            });
          }
        }
      },

      // Check require() calls (CommonJS)
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal'
        ) {
          const importSource = node.arguments[0].value as string;

          if (allowList.has(importSource)) {
            return;
          }

          if (isAdapterPackage(importSource)) {
            context.report({
              node,
              messageId: 'adapterImport',
              data: { importSource, file: filename },
            });
            return;
          }

          if (isBannedPackage(importSource)) {
            context.report({
              node,
              messageId: 'frameworkImport',
              data: { importSource, file: filename },
            });
            return;
          }

          if (isSuspiciousInternal(importSource)) {
            context.report({
              node,
              messageId: 'suspiciousInternalImport',
              data: { importSource, file: filename },
            });
          }
        }
      },
    };
  },
};

export default rule;
