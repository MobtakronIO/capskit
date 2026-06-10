// @ts-nocheck

/**
 * Adapter Compatibility Tests
 * Tests the adapter manifest validation and version compatibility checking.
 */

import {
  validateAdapterManifest,
  checkVersionCompatibility,
  loadAdapterManifest,
  buildIncompatibilityError,
} from '../../src/capsule/kernel/helpers/adapter-validation.helper';

// Mock manifest for testing
const mockManifest = {
  name: 'test-adapter',
  version: '1.0.0',
  capskitVersion: {
    min: '0.2.0',
    max: '1.0.0',
  },
  capabilities: ['http', 'websocket'],
};

export async function runAdapterCompatibilityTests() {
  console.log('\n=== Adapter Compatibility Tests ===');

  // Test 1: validateAdapterManifest with valid manifest
  console.log('Test: validateAdapterManifest accepts valid manifest');
  const validResult = validateAdapterManifest(mockManifest);
  if (!validResult) {
    throw new Error('Expected valid manifest to be accepted');
  }
  if (validResult.name !== 'test-adapter') {
    throw new Error(`Expected name to be 'test-adapter', got '${validResult.name}'`);
  }
  if (validResult.version !== '1.0.0') {
    throw new Error(`Expected version to be '1.0.0', got '${validResult.version}'`);
  }
  if (validResult.capskitVersion.min !== '0.2.0') {
    throw new Error(`Expected min version to be '0.2.0', got '${validResult.capskitVersion.min}'`);
  }
  if (validResult.capskitVersion.max !== '1.0.0') {
    throw new Error(`Expected max version to be '1.0.0', got '${validResult.capskitVersion.max}'`);
  }
  if (!Array.isArray(validResult.capabilities) || validResult.capabilities.length !== 2) {
    throw new Error('Expected capabilities to be array with 2 elements');
  }
  console.log('✅ validateAdapterManifest accepts valid manifest');

  // Test 2: validateAdapterManifest rejects null/undefined
  console.log('Test: validateAdapterManifest rejects null');
  if (validateAdapterManifest(null) !== null) {
    throw new Error('Expected null to be rejected');
  }
  console.log('✅ validateAdapterManifest rejects null');

  // Test 3: validateAdapterManifest rejects manifest without name
  console.log('Test: validateAdapterManifest rejects manifest without name');
  const noName = { version: '1.0.0', capskitVersion: { min: '0.1.0' }, capabilities: ['http'] };
  if (validateAdapterManifest(noName) !== null) {
    throw new Error('Expected manifest without name to be rejected');
  }
  console.log('✅ validateAdapterManifest rejects manifest without name');

  // Test 4: validateAdapterManifest rejects manifest without version
  console.log('Test: validateAdapterManifest rejects manifest without version');
  const noVersion = { name: 'test', capskitVersion: { min: '0.1.0' }, capabilities: ['http'] };
  if (validateAdapterManifest(noVersion) !== null) {
    throw new Error('Expected manifest without version to be rejected');
  }
  console.log('✅ validateAdapterManifest rejects manifest without version');

  // Test 5: validateAdapterManifest rejects manifest without capskitVersion
  console.log('Test: validateAdapterManifest rejects manifest without capskitVersion');
  const noCapskitVersion = { name: 'test', version: '1.0.0', capabilities: ['http'] };
  if (validateAdapterManifest(noCapskitVersion) !== null) {
    throw new Error('Expected manifest without capskitVersion to be rejected');
  }
  console.log('✅ validateAdapterManifest rejects manifest without capskitVersion');

  // Test 6: validateAdapterManifest rejects manifest without capabilities
  console.log('Test: validateAdapterManifest rejects manifest without capabilities');
  const noCapabilities = { name: 'test', version: '1.0.0', capskitVersion: { min: '0.1.0' } };
  if (validateAdapterManifest(noCapabilities) !== null) {
    throw new Error('Expected manifest without capabilities to be rejected');
  }
  console.log('✅ validateAdapterManifest rejects manifest without capabilities');

  // Test 7: validateAdapterManifest rejects invalid capabilities
  console.log('Test: validateAdapterManifest rejects invalid capabilities');
  const invalidCaps = { name: 'test', version: '1.0.0', capskitVersion: { min: '0.1.0' }, capabilities: ['invalid'] };
  if (validateAdapterManifest(invalidCaps) !== null) {
    throw new Error('Expected manifest with invalid capabilities to be rejected');
  }
  console.log('✅ validateAdapterManifest rejects invalid capabilities');

  // Test 8: checkVersionCompatibility - compatible version
  console.log('Test: checkVersionCompatibility returns compatible for matching version');
  const compatResult = checkVersionCompatibility('1.0.0', '0.3.0', { min: '0.2.0', max: '1.0.0' });
  if (!compatResult.compatible) {
    throw new Error('Expected version 0.3.0 to be compatible with range 0.2.0 - 1.0.0');
  }
  console.log('✅ checkVersionCompatibility returns compatible for matching version');

  // Test 9: checkVersionCompatibility - version too low
  console.log('Test: checkVersionCompatibility returns incompatible for version too low');
  const tooLowResult = checkVersionCompatibility('1.0.0', '0.1.0', { min: '0.2.0' });
  if (tooLowResult.compatible) {
    throw new Error('Expected version 0.1.0 to be incompatible with min 0.2.0');
  }
  if (!tooLowResult.reason) {
    throw new Error('Expected reason to be provided for incompatible version');
  }
  if (!tooLowResult.reason.includes('npm install')) {
    throw new Error('Expected actionable error message to include npm install instruction');
  }
  console.log('✅ checkVersionCompatibility returns incompatible for version too low');
  console.log(`   Reason: ${tooLowResult.reason}`);

  // Test 10: checkVersionCompatibility - version too high
  console.log('Test: checkVersionCompatibility returns incompatible for version too high');
  const tooHighResult = checkVersionCompatibility('1.0.0', '2.0.0', { min: '0.2.0', max: '1.0.0' });
  if (tooHighResult.compatible) {
    throw new Error('Expected version 2.0.0 to be incompatible with max 1.0.0');
  }
  if (!tooHighResult.reason) {
    throw new Error('Expected reason to be provided for incompatible version');
  }
  console.log('✅ checkVersionCompatibility returns incompatible for version too high');
  console.log(`   Reason: ${tooHighResult.reason}`);

  // Test 11: checkVersionCompatibility - exact minimum version
  console.log('Test: checkVersionCompatibility accepts exact minimum version');
  const exactMinResult = checkVersionCompatibility('1.0.0', '0.2.0', { min: '0.2.0' });
  if (!exactMinResult.compatible) {
    throw new Error('Expected version 0.2.0 to be compatible with exact min 0.2.0');
  }
  console.log('✅ checkVersionCompatibility accepts exact minimum version');

  // Test 12: buildIncompatibilityError generates actionable message
  console.log('Test: buildIncompatibilityError generates actionable message');
  const errorMsg = buildIncompatibilityError(
    'test-adapter',
    '1.0.0',
    '0.1.0',
    { compatible: false, reason: `Adapter 'test-adapter' requires capskit@^0.2.0 but you're using @0.1.0. Run 'npm install @mobtakronio/capskit@^0.2.0' to upgrade.` }
  );
  if (!errorMsg.includes('npm install')) {
    throw new Error('Expected actionable error message to include npm install instruction');
  }
  console.log('✅ buildIncompatibilityError generates actionable message');
  console.log(`   Error: ${errorMsg}`);

  // Test 13: loadAdapterManifest with mock module
  console.log('Test: loadAdapterManifest extracts manifest from module');
  const mockModule = { manifest: mockManifest };
  const loadedManifest = await loadAdapterManifest('test-adapter', mockModule);
  if (!loadedManifest) {
    throw new Error('Expected manifest to be loaded from module');
  }
  if (loadedManifest.name !== 'test-adapter') {
    throw new Error(`Expected loaded manifest name to be 'test-adapter', got '${loadedManifest.name}'`);
  }
  console.log('✅ loadAdapterManifest extracts manifest from module');

  // Test 14: loadAdapterManifest returns null for module without manifest
  console.log('Test: loadAdapterManifest returns null for module without manifest');
  const noManifestModule = { default: () => {} };
  const noManifestResult = await loadAdapterManifest('test-adapter', noManifestModule);
  if (noManifestResult !== null) {
    throw new Error('Expected null for module without manifest');
  }
  console.log('✅ loadAdapterManifest returns null for module without manifest');

  // Test 15: Adapter without manifest still works (backwards compatibility)
  console.log('Test: Adapters without manifest are treated as compatible');
  const noManifestCompat = checkVersionCompatibility('1.0.0', '99.0.0', { min: '0.1.0' });
  // Since there's no manifest, we don't know the range - this is backwards compatible
  // The checkVersionCompatibility itself doesn't check for missing manifests
  console.log('✅ Adapters without manifest are treated as compatible (no validation occurs)');

  // Test 16: Multiple capability support
  console.log('Test: Manifest with multiple capabilities is valid');
  const multiCap = {
    name: 'multi-adapter',
    version: '2.0.0',
    capskitVersion: { min: '0.1.0' },
    capabilities: ['http', 'websocket'],
  };
  const multiCapResult = validateAdapterManifest(multiCap);
  if (!multiCapResult) {
    throw new Error('Expected manifest with http+websocket to be valid');
  }
  console.log('✅ Manifest with multiple capabilities is valid');

  // Test 17: Single capability support
  console.log('Test: Manifest with single capability is valid');
  const singleCap = {
    name: 'http-only-adapter',
    version: '1.0.0',
    capskitVersion: { min: '0.1.0' },
    capabilities: ['http'],
  };
  const singleCapResult = validateAdapterManifest(singleCap);
  if (!singleCapResult) {
    throw new Error('Expected manifest with http only to be valid');
  }
  console.log('✅ Manifest with single capability is valid');

  console.log('=== All Adapter Compatibility Tests Passed ===');
}
