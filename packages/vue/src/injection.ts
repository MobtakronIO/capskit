import { inject, provide, type InjectionKey } from 'vue';
import type { CapsKitClient } from '@mobtakronio/capskit-client';

const CapsKitKey: InjectionKey<CapsKitClient> = Symbol('capskit');

export function provideCapsKit(client: CapsKitClient) {
  provide(CapsKitKey, client);
}

export function injectCapsKit(): CapsKitClient {
  const client = inject(CapsKitKey);
  if (!client) {
    throw new Error('injectCapsKit must be used within a provideCapsKit');
  }
  return client;
}
