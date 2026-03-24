# WebSocket Adapter

The WebSocket adapter exposes capsule actions as WebSocket events using the Elysia WebSocket plugin. This guide covers socket setup, message routing, and real-time patterns.

## Setup

```ts
import { createCapsKit } from '@mobtakronio/capskit'
import { Elysia } from 'elysia'
import { ws } from '@elysiajs/websocket'

const { capskit } = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }]
})

// Build WebSocket router
const { websocket } = await capskit.use('websocket').buildRouter({
  adapter: 'elysia'
})

new Elysia()
  .use(
    ws({
      '/ws': websocket
    })
  )
  .listen(3000)
```

## Defining Socket Events

In your capsule manifest, declare WebSocket events:

```ts
export const service: CapsuleManifest = {
  name: 'chat-capsule',
  actions: {
    sendMessage: { handler: './actions/sendMessage' },
    getHistory: { handler: './actions/getHistory' }
  },
  sockets: [
    { event: 'message', action: 'sendMessage' },
    { event: 'history', action: 'getHistory' }
  ]
}
```

### Socket Object

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `event` | `string` | ✓ | WebSocket event name (client message) |
| `action` | `string` | ✓ | Action to invoke |
| `traits` | `string[]` | ✗ | Optional traits (middleware) |

## Message Flow

```
Client sends → { "event": "message", "payload": { "text": "Hello" } }
         ↓
Adapter routes to action based on `event` → `action` mapping
         ↓
Action receives payload in `context.body` (already validated)
         ↓
Action returns result
         ↓
Adapter sends response back to client (same event name by default)
```

## Action Context for WebSocket

Inside a WebSocket action, `context` includes:

```ts
interface WebSocketActionContext extends ActionContext {
  body: any;                    // Message payload
  params?: Record<string, string>; // URL query params from WS URL
  ws: WebSocket;               // The underlying WebSocket instance
  room?: string;               // Room name (if using rooms)
}
```

### Accessing the WebSocket

```ts
export default async function sendMessage(payload, ctx) {
  // Send a message back to the same client
  ctx.ws.send(JSON.stringify({
    type: 'message.sent',
    data: { id: '123' }
  }))
  
  // Broadcast to all clients in a room
  if (ctx.room) {
    const message = await ctx.deps.database.save(payload)
    ctx.deps.websocket.broadcastToRoom(ctx.room, {
      type: 'new.message',
      data: message
    })
  }
  
  return { sent: true }
}
```

## Rooms & Broadcasts

Organize clients into **rooms** for targeted broadcasting:

### Joining Rooms

Clients join rooms by sending a special event (you define the convention):

```ts
// In manifest
sockets: [
  { event: 'join.room', action: 'joinRoom' },
  { event: 'message', action: 'sendMessage' }
]

// In action
export default async function joinRoom(payload, ctx) {
  const { roomId } = payload
  ctx.room = roomId // Adapter adds this socket to the room
  ctx.ws.send(JSON.stringify({ type: 'joined', room: roomId }))
  return { joined: roomId }
}
```

### Broadcasting

From *any* action, broadcast to a room:

```ts
export default async function notifyRoom(payload, ctx) {
  // Access the WebSocket adapter's broadcast API
  await ctx.deps.websocket.broadcastToRoom('admin-room', {
    type: 'admin.notification',
    message: 'System maintenance in 5 minutes'
  })
  
  return { broadcast: true }
}
```

You need to set up the broadcast helper in dependencies:

```ts
// During setup
import { createWebSocketAdapter } from '@mobtakronio/capskit/adapters/websocket'

const adapter = await createWebSocketAdapter(capskit)
const wss = new WebSocketServer({ port: 3001 })

wss.on('connection', (ws, req) => {
  adapter.handleConnection(ws, req)
})

// Make broadcast helper available
const { capskit } = await createCapsKit({
  dependencies: {
    websocket: {
      broadcastToRoom: (room, message) => adapter.broadcastToRoom(room, message)
    }
  }
})
```

## Authentication

Use **traits** for WebSocket connection authentication:

```ts
const { capskit } = await createCapsKit({
  traitHandlers: {
    'auth': async (token, ctx) => {
      const user = await ctx.deps.verifyToken(token)
      if (!user) throw new AuthorizationError('Invalid token')
      ctx.deps.currentUser = user // Attach user to context
    }
  }
})

// In manifest
sockets: [
  { event: 'message', action: 'sendMessage', traits: ['auth'] }
]
```

Clients send the token in the initial query params:

```
ws://localhost:3000/ws?token=abc123
```

## Message Schemas

Attach schemas to socket actions:

```ts
export const service: CapsuleManifest = {
  name: 'chat-capsule',
  actions: {
    sendMessage: {
      handler: './actions/sendMessage',
      schema: {
        type: 'object',
        properties: {
          roomId: { type: 'string' },
          text: { type: 'string', maxLength: 1000 }
        },
        required: ['roomId', 'text']
      }
    }
  },
  sockets: [{ event: 'message', action: 'sendMessage' }]
}
```

## Binary Data

Send binary data (ArrayBuffer, Blob) directly:

```ts
export default async function uploadFile(payload, ctx) {
  // payload can be ArrayBuffer, Blob, or File
  const buffer = Buffer.from(payload)
  await ctx.deps.storage.upload(payload.filename, buffer)
  
  ctx.ws.send(JSON.stringify({ type: 'upload.complete' }))
  return { uploaded: true }
}
```

Client-side:

```js
const ws = new WebSocket('ws://localhost:3000/ws')
const file = document.getElementById('file').files[0]
ws.onopen = () => {
  ws.send(file) // Sends as binary
}
```

## Reconnection & State

WebSocket connections are ephemeral. Handle reconnection gracefully:

- **Store session state** externally (Redis, database)
- **Re-subscribe to rooms** on reconnect (client logic)
- **Re-sync missed events** using sequence IDs or timestamps

```ts
// Server-side: track client session
const sessions = new Map<string, { userId: string; rooms: string[] }>()

export default async function connect(payload, ctx) {
  const token = ctx.request.headers.get('Authorization')?.slice(7)
  const user = await ctx.deps.auth.verify(token)
  
  sessions.set(ctx.ws, { userId: user.id, rooms: [] })
  ctx.ws.on('close', () => sessions.delete(ctx.ws))
  
  return { connected: true }
}
```

## Testing

Use a WebSocket client in tests:

```ts
import { test, expect } from 'bun:test'
import { WebSocket } from 'bun'

test('websocket chat message', async () => {
  const app = new Elysia().use(ws({ '/ws': websocket }))
  const server = app.listen(0)
  const port = server.port
  
  const ws = new WebSocket(`ws://localhost:${port}/ws`)
  
  await new Promise((resolve) => ws.onopen = resolve)
  
  ws.send(JSON.stringify({
    event: 'message',
    payload: { text: 'Hello' }
  }))
  
  const response = await new Promise((resolve) => {
    ws.onmessage = (e) => resolve(JSON.parse(e.data))
  })
  
  expect(response).toEqual({ sent: true })
  
  ws.close()
  server.close()
})
```

## Comparison: HTTP vs WebSocket

| Aspect | HTTP Adapter | WebSocket Adapter |
| :--- | :--- | :--- |
| **Communication** | Request → Response | Bidirectional streams |
| **State** | Stateless | Stateful connection |
| **Scalability** | Easy (load balanced) | Harder (sticky sessions) |
| **Use case** | REST APIs, CRUD | Real-time chat, games, dashboards |
| **Payload size** | Small-to-medium | Streams, large binary |

## Best Practices

1. **Keep messages small**—WebSocket frames have overhead.
2. **Use JSON**—or binary formats like MessagePack for efficiency.
3. **Implement heartbeats**—detect dead connections.
4. **Clean up rooms**—when clients disconnect, remove from all rooms.
5. **Validate schemas**—always attach schemas to actions.

## Next Steps

- **Events**: Combine WebSocket with pub/sub for scalable real-time
- **Traits**: Add auth and rate limiting to socket events
- **Interceptors**: Global connection lifecycle hooks
