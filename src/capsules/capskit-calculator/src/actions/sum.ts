import { ActionHandler } from '../../../../types';

export const sum: ActionHandler = async (payload, context) => {
  const { a, b } = payload?.body || payload;
  
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Inputs "a" and "b" must be numbers.');
  }

  const result = a + b;
  context.emit('calculator.calculated', { a, b, result });

  return { result };
};
