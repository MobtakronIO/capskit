import { createContext, useContext } from 'react';
import type { CapsKitClient } from '@mobtakronio/capskit-client';

export const CapsKitContext = createContext<CapsKitClient | null>(null);

export function CapsKitProvider({
  client,
  children,
}: {
  client: CapsKitClient;
  children: React.ReactNode;
}) {
  return (
    <CapsKitContext.Provider value={client}>{children}</CapsKitContext.Provider>
  );
}

export function useCapsKit(): CapsKitClient {
  const client = useContext(CapsKitContext);
  if (!client) {
    throw new Error('useCapsKit must be used within a CapsKitProvider');
  }
  return client;
}
