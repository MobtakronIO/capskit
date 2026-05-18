import { CapsuleDefinition } from './types/capsule-definition.type';
import { KernelDeps } from './types/cap-input.type';

export default {
  name: 'kernel',
  dependencies: [],
  boot: {
    init: async ({ deps }: { deps: KernelDeps }) => {
      // Built-in capsules are loaded by the boot sequence
      // User capsules are discovered from capsuleDirs
    },
  },
} satisfies CapsuleDefinition;
