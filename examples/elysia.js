import { createPlatform } from '../packages/core/src/index.ts';
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
            path.resolve(import.meta.dir, '../packages/core/src/system-capsules'), // Core System Capsules (system, http-elysia)
            path.resolve(import.meta.dir, '../packages/core/test-capsules') // Business Logic Capsules (calculator, etc.)
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

    // The http-elysia capsule exposes a 'listen' action.
    // Calling it starts the web server and automatically mounts all capsule routes.
    const port = 3000;
    await platform.call('http-elysia.listen', { port });

    console.log(`\n🚀 Gateway is live at http://localhost:${port}`);
    console.log('Try this in your terminal:');
    console.log(`curl -X POST http://localhost:${port}/calculate/sum -H "Content-Type: application/json" -d '{"body": {"a": 5, "b": 10}}'`);
}

main().catch(console.error);
