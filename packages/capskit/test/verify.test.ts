import { createCapsKit, createCapsKit as createCapsKitModern } from '../src/capsule/kernel/create-capskit';
import * as path from 'node:path';
import httpCapsuleDef from '../src/capsule/http/capsule';
import wsCapsuleDef from '../src/capsule/websocket/capsule';

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
import { runCallProxyTests } from './suites/call.suite';

import { test } from 'vitest';

const calculatorCapsuleDef = {
  name: 'capskit-calculator',
  caps: [
    {
      meta: { name: 'sum' },
      handler: async (input: any) => {
        const { a, b } = input.body || input;
        return { result: a + b };
      }
    },
    {
      meta: { name: 'subtract' },
      handler: async (input: any) => {
        const { a, b } = input.body || input;
        return { result: a - b };
      }
    },
    {
      meta: { name: 'multiply' },
      handler: async (input: any) => {
        const { a, b } = input.body || input;
        return { result: a * b };
      }
    },
    {
      meta: { name: 'divide' },
      handler: async (input: any) => {
        const { a, b } = input.body || input;
        if (b === 0) throw new Error('Division by zero');
        return { result: a / b };
      }
    }
  ]
};

async function verify() {
  console.log('--- Testing CapsKit Core ---');
  
  const { router, capskit } = await createCapsKit({
    capsules: [
      httpCapsuleDef,
      wsCapsuleDef,
      calculatorCapsuleDef,
    ],
    boot: {
      action: 'http.buildRouter',
      payload: {
        adapter: 'elysia',
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
  const wsResult = await capskit.use('websocket')['build-websocket']({ adapter: 'elysia' });
  console.log('Total Endpoints:', wsResult.totalEndpoints);
  console.log('✅ websocket.build-websocket works!');


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
   await runResiliencyTests(createCapsKitModern);
   await runCacheTests();
    await runCallProxyTests(createCapsKit);
   console.log('✅ All automated test suites passed');
 }


test('verify CapsKit core', async () => {
  await verify();
});
