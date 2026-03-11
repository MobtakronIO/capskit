import { createPlatform } from '../src/kernel/platform';
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

  console.log('--- Testing HTTP Elysia Capsule ---');
  console.log('Starting HTTP Elysia on port 3001...');
  await platform.call('http-elysia.listen', { port: 3001 });

  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('Testing POST /calculate/sum via HTTP...');
  try {
    const response = await fetch('http://localhost:3001/calculate/sum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 10, b: 20 })
    });
    
    const result: any = await response.json();
    console.log('HTTP Result:', result);
    
    if (result.result === 30) {
      console.log('✅ HTTP Elysia works!');
    } else {
      console.error('❌ HTTP Elysia failed: Unexpected result', result);
    }
  } catch (error) {
    console.error('❌ HTTP Elysia failed with error:', error);
  } finally {
    await platform.call('http-elysia.stop', {});
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
