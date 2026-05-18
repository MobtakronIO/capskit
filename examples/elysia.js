import { createCapsKitPlatform } from '@mobtakronio/capskit';
import { createRouter } from '@mobtakronio/capskit-elysia';

/**
 * CapsKit + Elysia — Adapter-Based Route Registration Example
 *
 * Demonstrates the full flow using the @mobtakronio/capskit-elysia adapter:
 *   1. Create platform         → createCapsKitPlatform()
 *   2. Boot with capsuleDirs   → platform.boot({ body: { capsuleDirs, dependencies } }, ctx)
 *   3. Build routes            → platform.call({ body: { capPath: 'http.build-router', payload: {} } }, ctx)
 *   4. Create Elysia app       → createRouter() from @mobtakronio/capskit-elysia
 *   5. Start listening         → app.listen(port)
 *
 * The key pattern: createCapsKitPlatform() returns raw CapHandler functions
 * (boot, call, describe, shutdown), not an ICapsKit instance.  To bridge
 * between the raw platform and the adapter, we build a lightweight ICapsKit
 * wrapper that delegates getManifests() → describe() and call() → the
 * platform's call handler with CapInput/CapContext plumbing.
 */

async function main() {
    // ── 1. Create platform ──────────────────────────────────────────
    // Returns raw handlers: { state, boot, call, use, register, shutdown, describe, rpc }
    const platform = await createCapsKitPlatform();

    // Build execution context.  Every platform handler expects a CapContext
    // with deps, emit, invoke, tell, and use.  This mirrors the internal
    // buildContext() helper inside platform.cap.ts.
    const ctx = createContext(platform);

    // ── 2. Boot ─────────────────────────────────────────────────────
    // capsuleDirs: directories containing your capsule modules.
    //   The 'capsules/' directory convention is used here.
    // dependencies: services injected into every cap via ctx.deps.
    // disableBuiltins: optionally skip kernel built-in capsules.
    await platform.boot(
        {
            body: {
                capsuleDirs: ['./capsules'],
                dependencies: {
                    logger: console,
                    db: { connected: true },
                },
                // disableBuiltins: ['websocket'],
            },
        },
        ctx,
    );

    // ── 3. Build routes via the built-in http capsule ───────────────
    // http.build-router is a kernel built-in cap that compiles all
    // registered caps with HTTP routes into a structured route table.
    // The compiled routes are surfaced through the describe() manifest,
    // which createRouter() reads internally.
    const compiledRoutes = await platform.call(
        {
            body: {
                capPath: 'http.build-router',
                payload: {},
            },
        },
        ctx,
    );
    console.log(`\nCompiled ${compiledRoutes.length ?? 0} route(s) from all capsules\n`);

    // ── 4. Create an Elysia app from routes via the adapter ─────────
    // The adapter (createRouter) expects an ICapsKit instance and
    // internally calls getManifests() + call() to register every
    // HTTP route on a new Elysia app.
    //
    // Since createCapsKitPlatform() returns raw handlers, we build a
    // lightweight ICapsKit wrapper (see createICapsKitWrapper below)
    // that bridges getManifests() → describe() and call() → platform.call().
    const capskit = createICapsKitWrapper(platform, ctx);
    const app = createRouter(capskit);

    // ── 5. Start listening ──────────────────────────────────────────
    const port = 3000;
    app.listen(port);
    console.log(`\nServer running at http://localhost:${port}`);

    // Graceful shutdown
    const cleanup = async () => {
        console.log('\nShutting down...');
        await platform.shutdown({}, ctx);
        process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

// ── ICapsKit Wrapper ───────────────────────────────────────────────────
//
// The pattern: createCapsKitPlatform() returns raw CapHandler functions,
// not an ICapsKit instance. The @mobtakronio/capskit-elysia adapter
// expects an ICapsKit with getManifests() and call().  This wrapper
// bridges the gap by delegating those two methods to the corresponding
// platform handlers, handling the CapInput wrapping and result unwrapping.

/**
 * Build a lightweight ICapsKit wrapper around the raw platform handlers.
 *
 * @param {object} platform - The result of createCapsKitPlatform()
 * @param {object} ctx     - The CapContext required by all platform handlers
 * @returns {import('@mobtakronio/capskit').ICapsKit}
 */
function createICapsKitWrapper(platform, ctx) {
    return {
        // getManifests(): delegates to the describe() handler, which
        // returns { capsules, capsuleCount, capCount }.  We extract
        // just the capsules array — the format the adapter expects.
        async getManifests() {
            const result = await platform.describe({}, ctx);
            return result.capsules ?? [];
        },

        // call(capPath, payload): delegates to the platform's call handler,
        // which expects its input as { body: { capPath, payload } }.
        // The platform returns { ok, result } or { ok: false, error } —
        // we unwrap to throw or return for the adapter.
        async call(capPath, payload) {
            const result = await platform.call(
                { body: { capPath, payload } },
                ctx,
            );
            if (result.ok) return result.result;
            throw new Error(result.error ?? 'Call failed');
        },

        // ── Stubs for the remaining ICapsKit methods ─────────────────
        // These are not used by createRouter() but are required by the
        // ICapsKit interface.  They are stubbed to no-ops.

        async start() {
            return { status: 'ready', capsuleCount: 0, capCount: 0 };
        },

        use(_capsuleName) {
            return {};
        },

        emit(_event, _data) {},

        tell(_capPath, _payload) {},

        describe(_capsuleName) {
            return undefined;
        },

        addHook(_hook) {},

        async shutdown() {
            await platform.shutdown({}, ctx);
            return { status: 'shutdown' };
        },
    };
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Build a CapContext that lets us invoke platform handlers directly.
 * Replicates the internal kernel buildContext() from platform.cap.ts.
 */
function createContext(platform) {
    const state = platform.state;

    return {
        deps: {
            ...state.dependencies,
            capsules: state.capsules,
            capsMap: state.caps,
            allCaps: state.allCaps,
            dependencies: state.dependencies,
        },
        emit(_event, _data) {
            // Events capsule wiring — stub for example
        },
        async invoke(capPath, payload) {
            return platform.call(
                { body: { capPath, payload } },
                createContext(platform),
            );
        },
        tell(_capPath, _payload) {
            // Fire-and-forget — stub for example
        },
        use(capsuleName) {
            return new Proxy(
                {},
                {
                    get(_target, prop) {
                        return async (payload) =>
                            platform.call(
                                {
                                    body: {
                                        capPath: `${capsuleName}.${prop}`,
                                        payload,
                                    },
                                },
                                createContext(platform),
                            );
                    },
                },
            );
        },
    };
}

main().catch(console.error);
