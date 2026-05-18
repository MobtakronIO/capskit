import { CapHandler } from '../types/cap-input.type';
import { InternalState } from '../types/platform.types';
import { buildContext } from '../helpers/build-context.helper';

export async function createCapsKitPlatform(): Promise<{
  state: InternalState;
  call: CapHandler;
  use: CapHandler;
  register: CapHandler;
  shutdown: CapHandler;
  boot: CapHandler;
  describe: CapHandler;
  rpc: CapHandler;
}> {
  const state: InternalState = {
    capsules: new Map(),
    caps: new Map(),
    allCaps: new Map(),
    dependencies: {},
    booted: false,
  };

  // Import the cap handlers
  const bootMod = await import('./boot.cap');
  const callMod = await import('./call.cap');
  const useMod = await import('./use.cap');
  const registerMod = await import('./register.cap');
  const shutdownMod = await import('./shutdown.cap');
  const describeMod = await import('./describe.cap');
  const rpcMod = await import('./rpc.cap');

  return {
    state,
    boot: bootMod.default,
    call: callMod.default,
    use: useMod.default,
    register: registerMod.default,
    shutdown: shutdownMod.default,
    describe: describeMod.default,
    rpc: rpcMod.default,
  };
}
