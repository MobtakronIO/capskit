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
const noCapMetaMissing = require('../lint/no-cap-meta-missing').rule;
const noCapLogicMissing = require('../lint/no-cap-logic-missing').rule;
const capsRegistryRequired = require('../lint/caps-registry-required').rule;
const noManifestInCap = require('../lint/no-manifest-in-cap').rule;
const noFrameworkCouplingInCap = require('../lint/no-framework-coupling-in-cap').rule;

module.exports = {
  '@capskit/no-direct-call': noDirectCall,
  '@capskit/no-cap-meta-missing': noCapMetaMissing,
  '@capskit/no-cap-logic-missing': noCapLogicMissing,
  '@capskit/caps-registry-required': capsRegistryRequired,
  '@capskit/no-manifest-in-cap': noManifestInCap,
  '@capskit/no-framework-coupling-in-cap': noFrameworkCouplingInCap,
};
