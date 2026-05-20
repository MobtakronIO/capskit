import { CapMeta } from '../types/cap-meta.type';

export function validateCapMeta(meta: CapMeta): boolean {
  if (!meta || typeof meta !== 'object') return false;
  if (typeof meta.name !== 'string' || meta.name.length === 0) return false;
  return true;
}
