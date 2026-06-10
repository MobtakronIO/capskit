/**
 * Error Taxonomy Test Suite
 *
 * Verifies the consistency and behavior of the CapsKit error taxonomy.
 * - FrameworkError hierarchy
 * - Error envelope serialization
 * - Environment-based stack hiding
 * - Loader-specific errors (CapLoadError, DuplicateCapNameError, CapCycleError)
 */

import assert from 'assert';
import {
  FrameworkError,
  ValidationError,
  NotFoundError,
  TimeoutError,
  UnauthorizedError,
  AuthorizationError,
  TraitError,
  HandlerError,
  InternalError,
  DependencyError,
  toErrorEnvelope,
  shouldExposeStack,
  getSafeErrorMessage,
  DuplicateCapNameError,
  CapCycleError,
} from '../../src/capsule/kernel';

export async function runErrorTaxonomyTests() {
  console.log('\n📦 Error Taxonomy Tests');

  // 1. Base FrameworkError
  test('FrameworkError sets code and status', () => {
    const err = new FrameworkError('Something broke', 'TEST_ERROR', 500);
    assert.strictEqual(err.code, 'TEST_ERROR');
    assert.strictEqual(err.status, 500);
    assert.strictEqual(err.isFrameworkError, true);
  });

  // 2. Specific Error Subtypes
  test('ValidationError has code VALIDATION_ERROR and status 400', () => {
    const err = new ValidationError('bad input');
    assert.strictEqual(err.code, 'VALIDATION_ERROR');
    assert.strictEqual(err.status, 400);
  });

  test('NotFoundError has code NOT_FOUND_ERROR and status 404', () => {
    const err = new NotFoundError('gone');
    assert.strictEqual(err.code, 'NOT_FOUND_ERROR');
    assert.strictEqual(err.status, 404);
  });

  test('TimeoutError has code TIMEOUT_ERROR and status 408', () => {
    const err = new TimeoutError('too slow');
    assert.strictEqual(err.code, 'TIMEOUT_ERROR');
    assert.strictEqual(err.status, 408);
  });

  test('UnauthorizedError has code UNAUTHORIZED_ERROR and status 401', () => {
    const err = new UnauthorizedError('no creds');
    assert.strictEqual(err.code, 'UNAUTHORIZED_ERROR');
    assert.strictEqual(err.status, 401);
  });

  test('AuthorizationError has code FORBIDDEN_ERROR and status 403', () => {
    const err = new AuthorizationError('nope');
    assert.strictEqual(err.code, 'FORBIDDEN_ERROR');
    assert.strictEqual(err.status, 403);
  });

  test('TraitError has code TRAIT_ERROR and status 403', () => {
    const err = new TraitError('missing trait', 'billing:write');
    assert.strictEqual(err.code, 'TRAIT_ERROR');
    assert.strictEqual(err.status, 403);
    assert.strictEqual(err.trait, 'billing:write');
  });

  test('HandlerError has code HANDLER_ERROR and status 500', () => {
    const err = new HandlerError('handler blew up', 'doThing');
    assert.strictEqual(err.code, 'HANDLER_ERROR');
    assert.strictEqual(err.status, 500);
    assert.strictEqual(err.actionName, 'doThing');
  });

  test('DependencyError has code DEPENDENCY_ERROR and status 500', () => {
    const err = new DependencyError('db down');
    assert.strictEqual(err.code, 'DEPENDENCY_ERROR');
    assert.strictEqual(err.status, 500);
  });

  test('InternalError has code INTERNAL_ERROR and status 500', () => {
    const err = new InternalError('weird state');
    assert.strictEqual(err.code, 'INTERNAL_ERROR');
    assert.strictEqual(err.status, 500);
  });

  // 3. Loader Errors
  test('DuplicateCapNameError extends CapLoadError', () => {
    const err = new DuplicateCapNameError(['cap-a', 'cap-b'], 'test context');
    assert.strictEqual(err.name, 'DuplicateCapNameError');
    assert(err.message.includes('cap-a'));
    assert(err.message.includes('cap-b'));
    assert.deepStrictEqual(err.duplicates, ['cap-a', 'cap-b']);
  });

  test('CapCycleError extends CapLoadError', () => {
    const err = new CapCycleError(['a', 'b', 'c'], 'test context');
    assert.strictEqual(err.name, 'CapCycleError');
    assert(err.message.includes('a → b → c'));
    assert.deepStrictEqual(err.cycle, ['a', 'b', 'c']);
  });

  // 4. Error Envelope
  test('toErrorEnvelope produces correct shape', () => {
    const err = new ValidationError('missing email', { field: 'email' });
    const envelope = err.toEnvelope();
    assert.strictEqual(envelope.code, 'VALIDATION_ERROR');
    assert.strictEqual(envelope.message, 'missing email');
    assert.strictEqual(envelope.status, 400);
    assert.deepStrictEqual(envelope.details, { field: 'email' });
  });

  test('toErrorEnvelope handles native errors', () => {
    const err = new Error('boom');
    const envelope = toErrorEnvelope(err);
    assert.strictEqual(envelope.code, 'UNKNOWN_ERROR');
    assert.strictEqual(envelope.message, 'boom');
    assert.strictEqual(envelope.status, 500);
  });

  test('toErrorEnvelope handles non-Error throwables', () => {
    const envelope = toErrorEnvelope('string error');
    assert.strictEqual(envelope.code, 'UNKNOWN_ERROR');
    assert.strictEqual(envelope.message, 'string error');
    assert.strictEqual(envelope.status, 500);
  });

  // 5. Environment-based stack visibility
  test('shouldExposeStack returns true in non-production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    assert.strictEqual(shouldExposeStack(), true);
    process.env.NODE_ENV = original;
  });

  test('shouldExposeStack returns false in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    assert.strictEqual(shouldExposeStack(), false);
    process.env.NODE_ENV = original;
  });

  test('getSafeErrorMessage hides non-framework messages in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    const frameworkErr = new ValidationError('secret');
    assert.strictEqual(getSafeErrorMessage(frameworkErr, true), 'secret');
    
    const nativeErr = new Error('secret');
    assert.strictEqual(getSafeErrorMessage(nativeErr, false), 'An unexpected error occurred');
    
    process.env.NODE_ENV = original;
  });

  console.log('✅ All Error Taxonomy tests passed');
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.log(`  ❌ ${name}`);
    throw err;
  }
}
