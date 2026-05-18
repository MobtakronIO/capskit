import { useMemo } from 'react';
import { useCapsKit } from './context';
import type { CapsuleProxy } from '@mobtakronio/capskit-client';

export function useCapsule<TCapsule = CapsuleProxy>(
  capsuleName: string,
): TCapsule {
  const client = useCapsKit();
  return useMemo(
    () => client.use<TCapsule>(capsuleName),
    [client, capsuleName],
  );
}
