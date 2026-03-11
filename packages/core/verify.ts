import { createPlatform } from './src/platform';
import * as path from 'path';

async function verify() {
  console.log('--- Testing CapsKit Core ---');
  
  const platform = await createPlatform({
    capsulesDir: path.join(process.cwd(), 'test-capsules'),
    dependencies: {
      database: { connected: true }
    }
  });

  console.log('Starting platform...');
  await platform.start();

  console.log('Calling test-capsule.ping...');
  try {
    const result = await platform.call('test-capsule.ping', { params: {} });
    console.log('Result:', result);
    
    if (result.message === 'pong' && result.db === true) {
      console.log('✅ Verification successful!');
    } else {
      console.error('❌ Verification failed: Unexpected result', result);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Verification failed with error:', error);
    process.exit(1);
  }

  console.log('--- Testing System Capsule ---');
  // Manual registration for verification purpose
  const { service: systemManifest } = await import(`file://${path.resolve('../system-capsules/manifest.ts')}`);
  (platform as any).registerCapsule(systemManifest);

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

  // Test dependency validation
  console.log('Testing dependency validation (should fail)...');
  try {
    const failingPlatform = await createPlatform({
      capsulesDir: path.join(process.cwd(), 'test-capsules'),
      dependencies: {} // Missing 'database'
    });
    await failingPlatform.start();
    console.error('❌ Error: Platform started despite missing dependency');
    process.exit(1);
  } catch (error) {
    console.log('✅ Correctly caught missing dependency:', error.message);
  }
}

verify();
