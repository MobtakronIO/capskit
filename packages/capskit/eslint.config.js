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

export default [
  {
    files: ['**/*.ts'],
    plugins: {
      '@capskit': {
        rules: {
          'no-direct-call': noDirectCallRule,
        },
      },
    },
    rules: {
      '@capskit/no-direct-call': 'warn',
    },
  },
];
