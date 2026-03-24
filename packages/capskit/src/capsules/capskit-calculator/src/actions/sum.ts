import { ActionHandler } from '../../../../types';
import { ValidationError } from '../../../../kernel/errors';

export const sum: ActionHandler = async (payload, context) => {
  const { a, b } = payload?.body || payload;
  
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new ValidationError('Inputs "a" and "b" must be numbers.');
  }

  const result = a + b;
  context.emit('capskit-calculator.sum', { a, b, result });

  return { result };
};
