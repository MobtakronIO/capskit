import { createCapsKit } from '../packages/capskit/src/index.ts';
import { Elysia } from 'elysia';

/**
 * Basic example demonstrating how to boot CapsKit with an Elysia adapter.
 */
async function main() {
    // 1. Initialize the platform with a boot action
    // In a monorepo, we can reference the built-in system 'http' capsule.
    const { router, capskit } = await createCapsKit({
        boot: {
            action: 'http.buildRouter',
            payload: { 
                adapter: '@mobtakronio/capskit-http-elysia' 
            }
        },
        dependencies: {
            database: { connection: 'connected' },
            logger: console
        }
    });

    console.log('--- CapsKit Platform Successfully Initialized ---');

    // 2. The router was built automatically by the boot action
    const app = new Elysia();
    app.use(router);

    // 3. Alternatively, you can always build/fetch transport blueprints manually:
    // const { router: manualRouter } = await capskit.use('http').buildRouter();

    const port = 3000;
    app.listen(port);

    console.log(`\n🚀 Gateway is live at http://localhost:${port}`);
    console.log('Available routes:', capskit.getManifests().flatMap(m => m.routes || []).map(r => r.path));
}

main().catch(console.error);
