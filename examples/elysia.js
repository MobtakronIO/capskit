import { createCapsKit } from '@mobtakronio/capskit';
import { createElysiaAdapter } from '@mobtakronio/capskit-elysia';

/**
 * CapsKit + Elysia — HTTP + WebSocket server example
 *
 * Flow:
 *   1. Create CapsKit  → createCapsKit({ capsuleDirs, dependencies })
 *   2. Create adapter  → createElysiaAdapter(capskit, { http, websocket })
 *   3. Listen          → app.ws(sockets).listen(port)
 */

async function main() {
  // ── 1. Create CapsKit with capsule directories ──────────────────
  const { capskit } = await createCapsKit({
    capsuleDirs: ['./capsules'],
    dependencies: {
      logger: console,
      db: { connected: true },
    },
  });

  // ── 2. Create unified Elysia adapter (HTTP + WebSocket) ────────
  const { app, sockets, shutdown } = await createElysiaAdapter(capskit, {
    http: true,
    websocket: true,
    traitHandlers: {
      auth: async (role, context) => {
        // Example trait handler — replace with real auth logic
        console.log(`[auth] checking role "${role}"`);
      },
    },
  });

  // ── 3. Start listening ──────────────────────────────────────────
  const port = 3000;
  app.ws(sockets).listen(port);
  console.log(`Server running at http://localhost:${port}`);
  console.log(`WebSocket at ws://localhost:${port}/ws/capskit`);

  // Graceful shutdown
  const cleanup = async () => {
    console.log('\nShutting down...');
    await shutdown();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch(console.error);
