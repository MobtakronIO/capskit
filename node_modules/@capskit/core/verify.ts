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
