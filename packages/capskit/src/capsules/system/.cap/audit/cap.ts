import { ActionInput, CapContext } from '../../../../types';

/**
 * Cap: audit — Global audit logger listener.
 *
 * Actions:
 * - audit
 *
 * Subscribes to: capskit-calculator.sum
 */
export default class AuditCap {
  [action: string]: any;

  async audit(input: ActionInput, _ctx: CapContext): Promise<{ success: boolean }> {
    console.log(
      '[System Audit] Event received correctly via Event Bus:',
      input.body,
    );
    return { success: true };
  }
}
