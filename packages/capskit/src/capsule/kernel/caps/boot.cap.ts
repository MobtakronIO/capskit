import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta } from '../types/cap-meta.type';
import { parseAndBuildState, loadAllCapsules, runBootLifecycles, shapeBootResponse } from '../helpers/boot-helpers.helper';
import { validateAndOrder } from '../helpers/validate-and-order.helper';

export const meta: CapMeta = {
  name: 'boot',
};

export default async function boot(input: CapInput, ctx: CapContext) {
  const { state, capsuleDirs, disableBuiltins, preRegisteredCapsules } = parseAndBuildState(input);

  await loadAllCapsules(disableBuiltins, capsuleDirs, state, preRegisteredCapsules);

  const sorted = validateAndOrder(state.capsules);

  await runBootLifecycles(sorted, state);

  return shapeBootResponse(sorted, state);
}
