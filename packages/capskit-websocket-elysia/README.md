# @mobtakronio/capskit-websocket-elysia 💊

**Elysia Transport Adapter for CapsKit** — The framework-agnostic WebSocket adapter for [CapsKit](https://github.com/MobtakronIO/capskit).

## 📦 Installation

```bash
npm install @mobtakronio/capskit @mobtakronio/capskit-websocket-elysia elysia
```

## 🛠️ Usage

Configure your CapsKit instance to use the Elysia WebSocket adapter:

```typescript
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';

const { capskit } = await createCapsKit({
  boot: {
    action: 'websocket.buildSocket',
    payload: { 
       adapter: '@mobtakronio/capskit-websocket-elysia' 
    }
  }
});

const { sockets } = await capskit.call('websocket.buildSocket');

// Elysia handles WebSockets on the main instance!
new Elysia({
  websocket: sockets
}).listen(3000);
```

## 📄 License

MIT © 2026 CapsKit Team / MobtakronIO
