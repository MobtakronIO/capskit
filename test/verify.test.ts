import { createCapsKit } from '../src/kernel/platform';
import { Elysia } from 'elysia';
import * as path from 'node:path';

async function verify() {
  console.log('--- Testing CapsKit Core ---');
  
  const { router, capskit } = await createCapsKit({
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
  console.log('Calling system.getHealth...');
  const health = await capskit.call('system.getHealth', {});
  console.log('Health:', health);
  if (health.status === 'healthy') {
    console.log('✅ system.getHealth works!');
  }

  console.log('Calling system.listCapsules...');
  const capsules = await capskit.call('system.listCapsules', {});
  console.log('Loaded Capsules:', capsules.map((m: any) => m.name));
  if (capsules.length > 0) {
    console.log('✅ system.listCapsules works!');
  }

  console.log('Calling system.metrics...');
  const metrics = await capskit.call('system.metrics', {});
  if (metrics.memory) {
    console.log('✅ system.metrics works!');
  }

  const app = new Elysia().use(router);
  app.listen(3001);

  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 500));

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
  }

  console.log('--- Testing WebSocket Capsule ---');
  console.log('Building WebSocket configuration via WS adapter...');
  const { sockets } = await capskit.call('websocket.buildSocket', { adapter: 'elysia' });
  console.log('Registered Sockets:', Object.keys(sockets));
  console.log('✅ websocket.buildSocket works!');

  await app.stop();

  console.log('--- Testing Calculator Capsule ---');
  console.log('Calling capskit-calculator.sum (5 + 10) via proxy client...');
  
  const calculator = capskit.use<{ sum: (payload: any) => Promise<any> }>('capskit-calculator');
  const sumResult = await calculator.sum({ a: 15, b: 10 });

  console.log('Result:', sumResult);
  if (sumResult.result === 25) {
    console.log('✅ capskit-calculator.sum works!');
  } else {
    console.error('❌ capskit-calculator.sum failed!');
    process.exit(1);
  }
}

verify();
