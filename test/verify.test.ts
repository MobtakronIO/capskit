import { createPlatform } from '../src/kernel/platform';
import { Elysia } from 'elysia';
import * as path from 'path';

async function verify() {
  console.log('--- Testing CapsKit Core ---');
  
  const platform = await createPlatform({
    capsuleDirs: [
      path.join(process.cwd(), 'src/capsules') // Built-in system capsules and capskit-calculator
    ],
    dependencies: {
      database: { connected: true }
    }
  });

  platform.addInterceptor(async (actionName, payload, context, next) => {
    console.log(`[Interceptor] ⏳ Pending: ${actionName}`);
    const start = Date.now();
    const result = await next();
    const ms = Date.now() - start;
    console.log(`[Interceptor] ✅ Resolved: ${actionName} in ${ms}ms`);
    return result;
  });

  console.log('Starting platform...');
  await platform.start();

  // test-capsule was removed

  console.log('--- Testing System Capsule ---');
  console.log('Calling system.getHealth...');
  const health = await platform.call('system.getHealth', {});
  console.log('Health:', health);
  if (health.status === 'healthy') {
    console.log('✅ system.getHealth works!');
  }

  console.log('Calling system.listCapsules...');
  const capsules = await platform.call('system.listCapsules', {});
  console.log('Loaded Capsules:', capsules.map((m: any) => m.name));
  if (capsules.length > 0) {
    console.log('✅ system.listCapsules works!');
  }

  console.log('Calling system.metrics...');
  const metrics = await platform.call('system.metrics', {});
  if (metrics.memory) {
    console.log('✅ system.metrics works!');
  }

  console.log('--- Testing HTTP Capsule ---');
  console.log('Building router via HTTP adapter...');
  const { router } = await platform.call('http.buildRouter', { 
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
  });

  const app = new Elysia().use(router);
  app.listen(3001);

  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('Testing POST /calculate/sum via HTTP (Unauthorized)...');
  try {
    const response = await fetch('http://localhost:3001/calculate/sum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 10, b: 20 })
    });
    
    if (response.status === 401) {
      console.log('✅ HTTP Elysia Route Traits works (Unauthorized blocked)!');
    } else {
      console.error('❌ HTTP Elysia Route Traits failed setup (Should have blocked!). Status:', response.status);
    }
  } catch (error) {
    console.error('❌ HTTP Elysia failed with error:', error);
  }

  console.log('Testing POST /calculate/sum via HTTP (Authorized)...');
  try {
    const response = await fetch('http://localhost:3001/calculate/sum', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token'
      },
      body: JSON.stringify({ a: 10, b: 20 })
    });
    
    const result: any = await response.json();
    console.log('HTTP Result:', result);
    
    if (result.result === 30) {
      console.log('✅ HTTP Elysia works (Authorized)!');
    } else {
      console.error('❌ HTTP Elysia failed: Unexpected result', result);
    }
  } catch (error) {
    console.error('❌ HTTP Elysia failed with error:', error);
  } finally {
    await app.stop();
  }

  console.log('--- Testing Calculator Capsule ---');
  console.log('Calling capskit-calculator.sum (5 + 10)...');
  const sumResult = await platform.call('capskit-calculator.sum', { a: 15, b: 10 });
  console.log('Result:', sumResult);
  if (sumResult.result === 25) {
    console.log('✅ capskit-calculator.sum works!');
  } else {
    console.error('❌ capskit-calculator.sum failed!');
    process.exit(1);
  }
}

verify();
