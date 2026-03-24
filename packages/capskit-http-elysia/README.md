# @mobtakronio/capskit-http-elysia 💊

**Elysia Transport Adapter for CapsKit** — The framework-agnostic HTTP adapter for [CapsKit](https://github.com/MobtakronIO/capskit).

## 📦 Installation

```bash
npm install @mobtakronio/capskit @mobtakronio/capskit-http-elysia elysia
```

## 🛠️ Usage

Configure your CapsKit instance to use the Elysia HTTP adapter:

```typescript
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';

const { capskit } = await createCapsKit({
  boot: {
    action: 'http.buildRouter',
    payload: { 
       adapter: '@mobtakronio/capskit-http-elysia' 
    }
  }
});

const { router } = await capskit.call('http.buildRouter');

new Elysia().use(router).listen(3000);
```

### Advanced: Custom Trait Handlers

```typescript
const { router } = await capskit.call('http.buildRouter', { 
  adapter: '@mobtakronio/capskit-http-elysia',
  traitHandlers: {
    auth: (role, { request, set }) => {
       // ... logic
    }
  }
});
```

## 📄 License

MIT © 2026 CapsKit Team / MobtakronIO
