import { createPlatform } from '../src/index.ts';
import { Elysia } from 'elysia';
import * as path from 'path';

/**
 * CapsKit Bootstrapper Example (Elysia)
 * 
 * This file demonstrates how to initialize the CapsKit platform
 * and attach the HTTP Elysia gateway to expose your capsule's capabilities.
 */
async function main() {
    const platform = await createPlatform({
        // Provide directories where your capsules are located.
        // The kernel will automatically scan and register them.
        capsuleDirs: [
            path.resolve(import.meta.dir, '../src/capsules') // Built-in capsules and capskit-calculator
        ],
        // Provide global dependencies (Databases, Redis, etc.)
        // These will be injected into every action's 'deps' object.
        dependencies: {
            database: { connection: 'connected', type: 'mock' },
            logger: console
        }
    });

    console.log('--- CapsKit Platform Initializing ---');

    // Start the kernel (Scans, loads manifests, and validates dependencies)
    await platform.start();

    // Instead of telling the capsule to listen, we ask it to build a router
    // This allows us to use our own Elysia instance
    const { router } = await platform.call('http-elysia.buildRouter', {});

    const app = new Elysia();
    
    // We can add our own custom host plugins here:
    // app.use(cors())
    // app.use(swagger())
    
    // Mount the capsule capabilities
    app.use(router);

    const port = 3000;
    app.listen(port);

    console.log(`\n🚀 Gateway is live at http://localhost:${port}`);
    console.log('Try this in your terminal:');
    console.log(`curl -X POST http://localhost:${port}/calculate/sum -H "Content-Type: application/json" -d '{"body": {"a": 5, "b": 10}}'`);
}

main().catch(console.error);
