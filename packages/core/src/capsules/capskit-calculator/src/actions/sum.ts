import { ActionHandler } from '../../../../types';

export const sum: ActionHandler = async (payload) => {
  const { a, b } = payload.body || payload;
  
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Inputs "a" and "b" must be numbers.');
  }

  return { result: a + b };
};
