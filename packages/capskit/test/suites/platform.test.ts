// @ts-nocheck

import { ValidationError, NotFoundError, DependencyError, AuthorizationError, TraitError, HandlerError } from '../../src/kernel/errors';

/**
 * Platform core tests - run via verify.test.ts
 * Covers: DI invariant, manifest validation, duplicate detection, schema validation, introspection
 */

export async function runPlatformTests(kitFactory: (config: any) => Promise<any>) {
  console.log('\n=== Platform Tests ===');

  // Test 1: DI invariant - capskit cannot be overwritten
  console.log('Test: capskit DI invariant');
  const config1 = {
    capsules: [],
    dependencies: { capskit: 'fake', other: 'value' }
  };
  const result1 = await kitFactory(config1);
  const kit1 = result1.capskit;
  const deps = kit1.getDependencies ? kit1.getDependencies() : (kit1 as any).dependencies;
  if (deps.capskit !== kit1) {
    throw new Error('capskit dependency should be the kit itself, not user-provided');
  }
  if (deps.other !== 'value') {
    throw new Error('user dependencies should be merged');
  }
  console.log('✅ DI invariant holds');

  // Test warnOnDirectCall runtime warning - disabled by default
  console.log('Test: warnOnDirectCall disabled by default');
  const configWarn = {
    capsules: [
      {
        type: 'manifest',
        manifest: {
          name: 'test-warn',
          actions: {
            doThing: {
              handler: async (payload: any, _ctx: any) => ({ result: 'ok' })
            }
          }
        }
      }
    ]
  };
  const resultWarn = await kitFactory(configWarn);
  const kitWarn = resultWarn.capskit;
  
  // Capture console.warn calls
  let warningCaught: string | null = null;
  const originalWarn = console.warn;
  console.warn = (msg: string) => { warningCaught = msg; };
  
  // Direct call - should NOT warn when warnOnDirectCall not configured (default false)
  await kitWarn.call('test-warn.doThing', { body: {} });
  console.warn = originalWarn;
  
  if (warningCaught !== null) {
    throw new Error('Warning should not be emitted when warnOnDirectCall is not configured');
  }
  console.log('✅ warnOnDirectCall disabled by default - no warning emitted');

  // Test warnOnDirectCall - enabled via config
  console.log('Test: warnOnDirectCall enabled via config');
  const configWarnEnabled = {
    capsules: [
      {
        type: 'manifest',
        manifest: {
          name: 'test-warn2',
          actions: {
            doThing: {
              handler: async (payload: any, _ctx: any) => ({ result: 'ok' })
            }
          }
        }
      }
    ],
    warnOnDirectCall: true
  };
  const resultWarnEnabled = await kitFactory(configWarnEnabled);
  const kitWarnEnabled = resultWarnEnabled.capskit;
  
  // Capture console.warn calls
  warningCaught = null;
  console.warn = (msg: string) => { warningCaught = msg; };
  
  // Direct call - SHOULD warn
  await kitWarnEnabled.call('test-warn2.doThing', { body: {} });
  console.warn = originalWarn;
  
  if (warningCaught === null || !warningCaught.includes('Warning: Direct')) {
    throw new Error('Warning should be emitted when warnOnDirectCall is enabled');
  }
  console.log('✅ warnOnDirectCall enabled - warning emitted for direct call');

  // Test warnOnDirectCall - use() proxy does NOT trigger warning
  console.log('Test: warnOnDirectCall - use() proxy does not trigger warning');
  warningCaught = null;
  console.warn = (msg: string) => { warningCaught = msg; };
  
  // Call via use() proxy - should NOT warn
  await kitWarnEnabled.use('test-warn2').doThing({});
  console.warn = originalWarn;
  
  if (warningCaught !== null) {
    throw new Error('Warning should NOT be emitted when using use() proxy');
  }
  console.log('✅ use() proxy does not trigger warning');

  // Test 2: Manifest validation - missing name
  console.log('Test: manifest validation - missing name');
  try {
    await kitFactory({
      capsules: [
        { type: 'manifest', manifest: { name: '', actions: {} } }
      ]
    });
    throw new Error('should have rejected manifest with missing name');
  } catch (error: any) {
    if (error.code !== 'VALIDATION_ERROR') {
      throw error;
    }
  }
  console.log('✅ missing name rejected');

  // Test 3: Manifest validation - missing actions
  console.log('Test: manifest validation - missing actions');
  try {
    await kitFactory({
      capsules: [
        { type: 'manifest', manifest: { name: 'test', actions: null } }
      ]
    });
    throw new Error('should have rejected manifest with missing actions');
  } catch (error: any) {
    if (error.code !== 'VALIDATION_ERROR') {
      throw error;
    }
  }
  console.log('✅ missing actions rejected');

  // Test 4: Duplicate capsule name
  console.log('Test: duplicate capsule name');
  try {
    await kitFactory({
      capsules: [
        { type: 'manifest', manifest: { name: 'dup', actions: { a: { handler: async () => {} } } } },
        { type: 'manifest', manifest: { name: 'dup', actions: { b: { handler: async () => {} } } } }
      ]
    });
    throw new Error('should have rejected duplicate capsule name');
  } catch (error: any) {
    if (!error.message.includes('Duplicate capsule name')) {
      throw error;
    }
  }
  console.log('✅ duplicate capsule name rejected');

  // Test 5: Schema validation
  console.log('Test: action schema validation');
  const result5 = await kitFactory({
    capsules: [
      {
        type: 'manifest',
        manifest: {
          name: 'validator',
          actions: {
        test: {
          handler: async (payload: any, _ctx: any) => payload,
          schema: { type: 'object', required: ['x'] }
        }
          }
        }
      }
    ]
  });
  const kit5 = result5.capskit;

  // Expect call without required field to throw ValidationError
  let caughtError: any = null;
  try {
    await kit5.call('validator.test', { body: { y: 2 } });
  } catch (err) {
    caughtError = err;
  }

  if (!caughtError) {
    throw new Error('ValidationError expected for missing required field');
  }
  if (caughtError.code !== 'VALIDATION_ERROR') {
    throw new Error(`Expected VALIDATION_ERROR, got ${caughtError.code}`);
  }
  if (!caughtError.message.includes('requires field')) {
    throw new Error(`Error message should indicate required field, got: ${caughtError.message}`);
  }

  // Provide required field should succeed
  const valResult = await kit5.call('validator.test', { body: { x: 1 } });
  if (valResult.body?.x !== 1) {
    throw new Error('expected payload body to be returned, got: ' + JSON.stringify(valResult));
  }
  console.log('✅ schema validation works');

  // Test 6: getManifests returns typed manifests
  console.log('Test: getManifests introspection');
  const manifests = kit5.getManifests();
  if (!Array.isArray(manifests)) {
    throw new Error('getManifests should return array');
  }
  const validatorManifest = manifests.find(m => m.name === 'validator');
  if (!validatorManifest) {
    throw new Error('validator manifest should be present');
  }
  if (!validatorManifest.actions['test']) {
    throw new Error('validator should have test action');
  }
  console.log('✅ getManifests works');

  console.log('=== All Platform Tests Passed ===');
}
