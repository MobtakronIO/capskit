import { CapsuleDefinition, CapFile } from './capsule-definition.type';

export interface CapsKitInstance {
  call: (capPath: string, payload?: unknown, options?: unknown) => Promise<unknown>;
  use: (capsuleName: string) => unknown;
  emit: (event: string, data: unknown) => void;
  invoke: (capPath: string, payload: unknown) => Promise<unknown>;
  tell: (capPath: string, payload: unknown) => void;
  start: () => Promise<{ status: string; capsuleCount: number; capCount: number }>;
  shutdown: () => Promise<{ status: string }>;
  describe: () => { capsules: string[]; caps: string[]; dependencies: string[] };
}

export interface InternalState {
  capsules: Map<string, { def: CapsuleDefinition; dir: string }>;
  caps: Map<string, CapFile>;
  allCaps: Map<string, CapFile>;
  dependencies: Record<string, unknown>;
  booted: boolean;
}
