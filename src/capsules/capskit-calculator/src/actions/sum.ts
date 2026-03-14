import { ActionHandler } from '../../../../types';

export const sum: ActionHandler = async ({ body }, { emit }) => {
  const data = typeof body === 'string' ? JSON.parse(body) : body;
  const result = Number(data?.a) + Number(data?.b);

  if (isNaN(result)) throw new Error('Inputs must be numeric');

  emit('calculator.calculated', { ...data, result });
  return { result };
};
