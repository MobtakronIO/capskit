import { computed, type ComputedRef } from 'vue';
import { injectCapsKit } from './injection';
import type { CapsuleProxy } from '@mobtakronio/capskit-client';

export function useCapsule<TCapsule = CapsuleProxy>(
  capsuleName: string,
): ComputedRef<TCapsule> {
  const client = injectCapsKit();
  return computed(() => client.use<TCapsule>(capsuleName));
}
