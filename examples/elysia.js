import { createCapsKit } from '../packages/capskit/src/index.ts';
import { Elysia } from 'elysia';
import * as path from 'path';


async function main() {

    const { router, capskit } = await createCapsKit({
        // Uses the new monorepo adapter resolution
        boot: {
            action: 'http.buildRouter',
            payload: { adapter: '@mobtakronio/capskit-http-elysia' }
        },
        dependencies: {
            database: { connection: 'connected', type: 'mock' },
            logger: console
        }
    });

    console.log('--- CapsKit Platform Initialized ---');
    const app = new Elysia();
    app.use(router);

    const port = 3000;
    app.listen(port);

    console.log(`\n🚀 Gateway is live at http://localhost:${port}`);
    console.log('Try this in your terminal:');
    console.log(`curl -X POST http://localhost:${port}/calculate/sum -H "Content-Type: application/json" -d '{"body": {"a": 5, "b": 10}}'`);
}

main().catch(console.error);
