import { CapsuleRegistry } from '../../types';
import CalculatorCap from './.cap/calculator/cap';
import { meta as calculatorMeta } from './.cap/calculator/cap.meta';

/**
 * CapsuleRegistry for the built-in calculator capsule.
 *
 * Composes a single cap — calculator — that performs basic arithmetic.
 * The kernel's boot pipeline converts this registry into a CapsuleManifest,
 * merging per-cap actions, routes, events, and dependencies.
 */
const calculatorCaps: CapsuleRegistry = {
  name: 'capskit-calculator',
  caps: [{ class: CalculatorCap, meta: calculatorMeta }],
};

export default calculatorCaps;
