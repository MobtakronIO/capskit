/**
 * ESLint configuration for CapsKit projects
 * 
 * Usage:
 * 1. Install the required ESLint plugin dependencies:
 *    npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
 * 
 * 2. Add to your eslint config file (e.g., eslint.config.js):
 * 
 *    import { capsKitLintRules } from '@mobtakronio/capskit/lint';
 * 
 *    export default [
 *      // ... your other config
 *      {
 *        files: ['**/*.ts'],
 *        languageOptions: {
 *          parser: require('@typescript-eslint/parser'),
 *        },
 *        plugins: {
 *          '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
 *        },
 *        rules: {
 *          ...capsKitLintRules,
 *        },
 *      },
 *    ];
 */

const noDirectCall = require('../lint/no-direct-call').rule;

module.exports = {
  '@capskit/no-direct-call': noDirectCall,
};
