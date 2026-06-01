import { CapsuleDefinition } from '../kernel/types/capsule-definition.type';
import buildRouterCap, { meta as buildRouterMeta } from './caps/build-router.cap';

export default {
  name: 'http',
  dependencies: [],
  caps: [
    { meta: buildRouterMeta, handler: buildRouterCap },
  ],
} satisfies CapsuleDefinition;
