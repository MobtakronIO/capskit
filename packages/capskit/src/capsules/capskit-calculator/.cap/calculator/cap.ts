import { ActionInput, CapContext } from '../../../../types';
import { ValidationError } from '../../../../kernel/errors';

/**
 * Cap: calculator — Basic arithmetic calculator cap.
 *
 * Actions:
 * - sum — Sums two numbers provided in the payload and emits an event
 */
export default class CalculatorCap {
  [action: string]: any;

  async sum(
    payload: ActionInput,
    ctx: CapContext,
  ): Promise<{ result: number }> {
    const { a, b } = payload.body ?? {};

    if (typeof a !== 'number' || typeof b !== 'number') {
      throw new ValidationError('Inputs "a" and "b" must be numbers.');
    }

    const result = a + b;
    ctx.emit('capskit-calculator.sum', { a, b, result });

    return { result };
  }
}
