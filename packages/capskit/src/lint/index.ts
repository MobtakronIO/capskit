/**
 * ESLint rules for CapsKit
 *
 * @capskit/no-direct-call       - Flags direct `capskit.call()` usage in application code
 * @capskit/no-cap-meta-missing  - Ensures each .cap directory has both cap.ts and cap.meta.ts
 * @capskit/no-cap-logic-missing - Ensures each .cap directory with cap.meta.ts also has cap.ts
 * @capskit/caps-registry-required - Ensures capsule directories with .cap subdirs have caps.ts
 */

export { rule as noDirectCall } from './no-direct-call';
export { rule as noCapMetaMissing } from './no-cap-meta-missing';
export { rule as noCapLogicMissing } from './no-cap-logic-missing';
export { rule as capsRegistryRequired } from './caps-registry-required';
