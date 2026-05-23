import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

export const meta: CapMeta = {
  name: 'audit',
  events: {
    subscribes: [{ event: 'capskit-calculator.sum', action: 'audit' }],
  },
};

export default async function audit(input: CapInput, ctx: CapContext) {
  return { success: true };
}
