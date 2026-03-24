import { ActionHandler } from '../../../../types';

export const audit: ActionHandler = async (payload) => {
  console.log('[System Audit] Event received correctly via Event Bus:', payload);
  return { success: true };
};
