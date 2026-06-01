import { CapsuleDefinition } from '../kernel/types/capsule-definition.type';
import buildWebSocketCap, { meta as buildWebSocketMeta } from './caps/build-websocket.cap';

export default {
  name: 'websocket',
  dependencies: [],
  caps: [
    { meta: buildWebSocketMeta, handler: buildWebSocketCap },
  ],
} satisfies CapsuleDefinition;
