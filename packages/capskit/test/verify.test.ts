import { createCapsKit } from '../src/kernel/platform';
import * as path from 'node:path';

// Automated test suites
import { runPlatformTests } from './suites/platform.suite';
import { runBootTests } from './suites/boot.suite';
import { runEventTests } from './suites/events.suite';
import { runLoaderEdgeCaseTests } from './suites/loader-edge-cases.suite';
import { runErrorTaxonomyTests } from './suites/error-taxonomy.suite';
import { runTraceTests } from './suites/trace.suite';
import { runCacheTests } from './suites/cache.suite';
import { runSchemaValidationTests } from './suites/schema-validation.suite';
import { runResiliencyTests } from './suites/resiliency.suite';
import { runInvokeTellTests } from './suites/invoke-tell.suite';
import { runDualFormatBootTests } from './suites/dual-format-boot.suite';

import { test } from 'vitest';

async function verify() {
  console.log('--- Testing CapsKit Core ---');
  
  const capsKitSrcDir = path.resolve(__dirname, '..', 'src', 'capsules');
  
  const { router, capskit } = await createCapsKit({
    capsuleDirs: [
      path.join(capsKitSrcDir, 'http'),
      path.join(capsKitSrcDir, 'websocket'),
      path.join(capsKitSrcDir, 'capskit-calculator'),
    ],
    boot: {
      action: 'http.buildRouter',
      payload: {
        adapter: 'elysia',
        traitHandlers: {
          auth: (role: string, { request, set }: any) => {
            const auth = request.headers.get('authorization');
            if (role === 'admin' && auth !== 'Bearer token') {
              set.status = 401;
              return { error: 'Unauthorized: admin role required' };
            }
          }
        }
      }
    },
    dependencies: {
      database: { connected: true }
    }
  });

  capskit.addInterceptor(async (actionName: string, payload: any, context: any, next: any) => {
    console.log(`[Interceptor] ⏳ Pending: ${actionName}`);
    const start = Date.now();
    const result = await next();
    const ms = Date.now() - start;
    console.log(`[Interceptor] ✅ Resolved: ${actionName} in ${ms}ms`);
    return result;
  });

  console.log('Starting capskit...');

  console.log('--- Testing System Capsule ---');
  console.log('Calling system.getHealth via use().action()...');
  const health = await capskit.use('system').getHealth({});
  console.log('Health:', health);
  if (health.status === 'healthy') {
    console.log('✅ system.getHealth works!');
  }

  console.log('Calling system.listCapsules via use().action()...');
  const capsules = await capskit.use('system').listCapsules({});
  console.log('Loaded Capsules:', capsules.map((m: any) => m.name));
  if (capsules.length > 0) {
    console.log('✅ system.listCapsules works!');
  }

  console.log('Calling system.metrics via use().action()...');
  const metrics = await capskit.use('system').metrics({});
  if (metrics.memory) {
    console.log('✅ system.metrics works!');
  }

  console.log('--- Testing WebSocket Capsule ---');
  console.log('Building WebSocket configuration via WS adapter...');
  const { sockets } = await capskit.use('websocket').buildSocket({ adapter: 'elysia' });
  console.log('Registered Sockets:', Object.keys(sockets));
  console.log('✅ websocket.buildSocket works!');

  console.log('--- Testing Calculator Capsule ---');
   console.log('Calling capskit-calculator.sum (5 + 10) via proxy client...');
   
   // @ts-ignore - using proxy access
   const calculator = capskit.use('capskit-calculator');
   const sumResult = await calculator.sum({ a: 15, b: 10 });

  console.log('Result:', sumResult);
  if (sumResult.result === 25) {
    console.log('✅ capskit-calculator.sum works!');
   } else {
     console.error('❌ capskit-calculator.sum failed!');
     process.exit(1);
   }

   // Run automated test suites for hardened contracts
   console.log('\n=== Running Automated Test Suites ===');
   await runPlatformTests(createCapsKit);
   await runBootTests();
   await runEventTests(createCapsKit);
   await runLoaderEdgeCaseTests();
   await runErrorTaxonomyTests();
   await runTraceTests(createCapsKit);
   await runSchemaValidationTests(createCapsKit);
   await runResiliencyTests(createCapsKit);
   await runCacheTests();
   await runInvokeTellTests(createCapsKit);
   await runDualFormatBootTests(createCapsKit);
   console.log('✅ All automated test suites passed');
 }

test('verify CapsKit core', async () => {
  await verify();
});
