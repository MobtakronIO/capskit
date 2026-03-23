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
          handler: async (ctx: any) => ctx.body,
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
  if (valResult.x !== 1) {
    throw new Error('expected payload to be returned');
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
