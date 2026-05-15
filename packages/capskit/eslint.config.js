/**
 * ESLint flat config for CapsKit projects
 * 
 * This config includes the @capskit/no-direct-call rule out of the box.
 * 
 * Usage:
 * 1. Install the required ESLint plugin dependencies:
 *    npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
 * 
 * 2. Add this file to your project root as `eslint.config.js`:
 * 
 *    import capsKitConfig from '@mobtakronio/capskit/eslint.config';
 * 
 *    export default [
 *      // ... your other config
 *      ...capsKitConfig,
 *    ];
 */

import noDirectCallRule from './dist/lint/no-direct-call.js';
import noCapMetaMissingRule from './dist/lint/no-cap-meta-missing.js';
import noCapLogicMissingRule from './dist/lint/no-cap-logic-missing.js';
import capsRegistryRequiredRule from './dist/lint/caps-registry-required.js';

export default [
  {
    files: ['**/*.ts'],
    plugins: {
      '@capskit': {
        rules: {
          'no-direct-call': noDirectCallRule,
          'no-cap-meta-missing': noCapMetaMissingRule,
          'no-cap-logic-missing': noCapLogicMissingRule,
          'caps-registry-required': capsRegistryRequiredRule,
        },
      },
    },
    rules: {
      '@capskit/no-direct-call': 'warn',
      '@capskit/no-cap-meta-missing': 'error',
      '@capskit/no-cap-logic-missing': 'error',
      '@capskit/caps-registry-required': 'error',
    },
  },
];
