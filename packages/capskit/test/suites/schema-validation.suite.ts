// @ts-nocheck

/**
 * Schema Validation Tests
 * Validates input/output schema contract enforcement at the kernel boundary.
 */

import { createCapsKit } from '../../src/capsule/kernel/create-capskit';
import { ValidationError } from '../../src/capsule/kernel/errors';

export async function runSchemaValidationTests(kitFactory = createCapsKit) {
  console.log('\n=== Schema Validation Tests ===');

  // Test capsule with various schema configurations
  const testCapsule = {
    name: 'test-schema',
    version: '1.0.0',
    actions: {
      // Action with inputSchema
      createUser: {
        handler: async (payload: any) => ({ id: 1, name: payload.body.name, email: payload.body.email }),
        inputSchema: {
          type: 'object',
          required: ['name', 'email'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            email: { type: 'string', format: 'email' },
            age: { type: 'integer', minimum: 0, maximum: 150 }
          }
        },
        outputSchema: {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              email: { type: 'string' }
            }
          },
          strict: true
        },
        metadata: { description: 'Create user' }
      },

      // Action with deprecated schema (backward compatibility)
      legacyAction: {
        handler: async (payload: any) => ({ result: 'ok', id: payload.body.id }),
        schema: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' }
          }
        },
        metadata: { description: 'Legacy action' }
      },

      // Action with format validation
      validateFormats: {
        handler: async () => ({ success: true }),
        inputSchema: {
          type: 'object',
          required: ['website', 'createdAt', 'userId'],
          properties: {
            website: { type: 'string', format: 'uri' },
            createdAt: { type: 'string', format: 'date-time' },
            userId: { type: 'string', format: 'uuid' }
          }
        },
        metadata: { description: 'Format validation' }
      },

      // Action with enum validation
      setStatus: {
        handler: async (payload: any) => ({ status: payload.body.status }),
        inputSchema: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'inactive', 'pending'] }
          }
        },
        metadata: { description: 'Enum validation' }
      },

      // Action with array validation
      addTags: {
        handler: async (payload: any) => ({ tags: payload.body.tags }),
        inputSchema: {
          type: 'object',
          required: ['tags'],
          properties: {
            tags: { type: 'array', items: { type: 'string' } }
          }
        },
        metadata: { description: 'Array validation' }
      },

      // Action with additionalProperties: false
      strictInput: {
        handler: async () => ({ ok: true }),
        inputSchema: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' }
          },
          additionalProperties: false
        },
        metadata: { description: 'Strict input' }
      },

      // Action with nullable field
      nullableField: {
        handler: async (payload: any) => ({ nickname: payload.body.nickname }),
        inputSchema: {
          type: 'object',
          properties: {
            nickname: { type: 'string', nullable: true }
          }
        },
        metadata: { description: 'Nullable field' }
      },

      // Action with pattern validation
      patternAction: {
        handler: async (payload: any) => ({ code: payload.body.code }),
        inputSchema: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', pattern: '^[A-Z]{3}-[0-9]{3}$' }
          }
        },
        metadata: { description: 'Pattern validation' }
      },

      // Action with no schema
      noSchema: {
        handler: async (payload: any) => ({ anything: payload.body.anything }),
        metadata: { description: 'No schema' }
      }
    }
  };

  const { capskit: kit } = await kitFactory({
    capsules: [{ type: 'manifest', manifest: testCapsule }],
    warnOnDirectCall: false
  });

  // ===== Input Validation Tests =====

  // Test: Valid input passes
  console.log('Test: Valid input passes');
  const validResult = await kit.call('test-schema.createUser', {
    body: {
      name: 'John',
      email: 'john@test.com'
    }
  });
  if (validResult.name !== 'John') throw new Error('Valid input failed');
  console.log('✅ Valid input passes');

  // Test: Missing required field throws ValidationError
  console.log('Test: Missing required field throws ValidationError');
  try {
    await kit.call('test-schema.createUser', { body: { name: 'John' } }); // missing email
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    if (!error.details.fieldErrors) throw new Error('Missing fieldErrors in details');
    const emailError = error.details.fieldErrors.find((e: any) => e.field === 'email');
    if (!emailError) throw new Error('Missing email field error');
    if (emailError.constraint !== 'required') throw new Error('Wrong constraint type');
  }
  console.log('✅ Missing required field throws ValidationError with fieldErrors');

  // Test: Wrong type throws ValidationError
  console.log('Test: Wrong type throws ValidationError');
  try {
    await kit.call('test-schema.createUser', {
      body: {
        name: 'John',
        email: 'john@test.com',
        age: 'not-a-number'
      }
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Wrong type throws ValidationError');

  // Test: String minLength constraint
  console.log('Test: String minLength constraint');
  try {
    await kit.call('test-schema.createUser', { body: { name: '', email: 'john@test.com' } });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ String minLength constraint enforced');

  // Test: String maxLength constraint
  console.log('Test: String maxLength constraint');
  try {
    await kit.call('test-schema.createUser', {
      body: {
        name: 'A'.repeat(101),
        email: 'john@test.com'
      }
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ String maxLength constraint enforced');

  // Test: Pattern validation
  console.log('Test: Pattern validation');
  try {
    await kit.call('test-schema.patternAction', { body: { code: 'invalid' } });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Pattern validation enforced');

  // Test: Valid pattern passes
  console.log('Test: Valid pattern passes');
  const patternResult = await kit.call('test-schema.patternAction', { body: { code: 'ABC-123' } });
  if (patternResult.code !== 'ABC-123') throw new Error('Pattern validation failed');
  console.log('✅ Valid pattern passes');

  // Test: Number minimum constraint
  console.log('Test: Number minimum constraint');
  try {
    await kit.call('test-schema.createUser', {
      body: {
        name: 'John',
        email: 'john@test.com',
        age: -1
      }
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Number minimum constraint enforced');

  // Test: Number maximum constraint
  console.log('Test: Number maximum constraint');
  try {
    await kit.call('test-schema.createUser', {
      body: {
        name: 'John',
        email: 'john@test.com',
        age: 200
      }
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Number maximum constraint enforced');

  // Test: Email format validation
  console.log('Test: Email format validation');
  try {
    await kit.call('test-schema.createUser', {
      body: {
        name: 'John',
        email: 'not-an-email'
      }
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Email format validation enforced');

  // Test: URI format validation
  console.log('Test: URI format validation');
  try {
    await kit.call('test-schema.validateFormats', {
      body: {
        website: 'not-a-url',
        createdAt: '2024-01-01T00:00:00Z',
        userId: '550e8400-e29b-41d4-a716-446655440000'
      }
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ URI format validation enforced');

  // Test: UUID format validation
  console.log('Test: UUID format validation');
  try {
    await kit.call('test-schema.validateFormats', {
      body: {
        website: 'https://example.com',
        createdAt: '2024-01-01T00:00:00Z',
        userId: 'not-a-uuid'
      }
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ UUID format validation enforced');

  // Test: Valid formats pass
  console.log('Test: Valid formats pass');
  const formatsResult = await kit.call('test-schema.validateFormats', {
    body: {
      website: 'https://example.com',
      createdAt: '2024-01-01T00:00:00Z',
      userId: '550e8400-e29b-41d4-a716-446655440000'
    }
  });
  if (!formatsResult.success) throw new Error('Valid formats failed');
  console.log('✅ Valid formats pass');

  // Test: Enum validation
  console.log('Test: Enum validation');
  try {
    await kit.call('test-schema.setStatus', { body: { status: 'deleted' } });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Enum validation enforced');

  // Test: Valid enum passes
  console.log('Test: Valid enum passes');
  const enumResult = await kit.call('test-schema.setStatus', { body: { status: 'active' } });
  if (enumResult.status !== 'active') throw new Error('Enum validation failed');
  console.log('✅ Valid enum passes');

  // Test: Array type validation
  console.log('Test: Array type validation');
  try {
    await kit.call('test-schema.addTags', { body: { tags: 'not-an-array' } });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Array type validation enforced');

  // Test: Array item type validation
  console.log('Test: Array item type validation');
  try {
    await kit.call('test-schema.addTags', { body: { tags: [1, 2, 3] } });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Array item type validation enforced');

  // Test: Valid array passes
  console.log('Test: Valid array passes');
  const arrayResult = await kit.call('test-schema.addTags', { body: { tags: ['node', 'js'] } });
  if (JSON.stringify(arrayResult.tags) !== JSON.stringify(['node', 'js'])) {
    throw new Error('Array validation failed');
  }
  console.log('✅ Valid array passes');

  // Test: additionalProperties: false
  console.log('Test: additionalProperties: false');
  try {
    await kit.call('test-schema.strictInput', {
      body: {
        name: 'John',
        unexpectedField: 'value'
      }
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    const unexpectedError = error.details.fieldErrors?.find((e: any) => e.field === 'unexpectedField');
    if (!unexpectedError) throw new Error('Missing unexpectedField error');
    if (unexpectedError.constraint !== 'additionalProperties:false') {
      throw new Error('Wrong constraint type');
    }
  }
  console.log('✅ additionalProperties: false enforced');

  // Test: Nullable field accepts null
  console.log('Test: Nullable field accepts null');
  const nullableResult = await kit.call('test-schema.nullableField', { body: { nickname: null } });
  if (nullableResult.nickname !== null) throw new Error('Nullable field failed');
  console.log('✅ Nullable field accepts null');

  // ===== Backward Compatibility Tests =====

  console.log('Test: Deprecated schema field still works');
  await kit.call('test-schema.legacyAction', { body: { id: 'abc-123' } });
  console.log('✅ Deprecated schema field still works');

  console.log('Test: Deprecated schema field validates');
  try {
    await kit.call('test-schema.legacyAction', { body: { name: 'test' } }); // missing id
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Deprecated schema field validates correctly');

  // ===== No Schema Tests =====

  console.log('Test: No schema allows any input');
  const noSchemaResult = await kit.call('test-schema.noSchema', { body: { anything: 'goes' } });
  if (noSchemaResult.anything !== 'goes') throw new Error('No schema failed');
  console.log('✅ No schema allows any input');

  // ===== Transport Parity Tests =====

  console.log('Test: Structured payload (body) validates');
  try {
    await kit.call('test-schema.createUser', {
      body: { name: 'John' }
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  console.log('✅ Structured payload validates correctly');

  console.log('Test: Structured payload passes validation');
  const structuredResult = await kit.call('test-schema.createUser', {
    body: { name: 'John', email: 'john@test.com' }
  });
  if (structuredResult.name !== 'John') throw new Error('Structured validation failed');
  console.log('✅ Structured payload passes validation');

  // ===== Output Validation Tests =====

  console.log('Test: Output validation in strict mode');
  const wrongOutputCapsule = {
    name: 'wrong-output',
    version: '1.0.0',
    actions: {
      getUser: {
        handler: async () => ({ id: 'string-instead-of-number', name: 'John' }),
        inputSchema: { type: 'object', required: [], properties: {} },
        outputSchema: {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' }
            }
          },
          strict: true
        },
        metadata: {}
      }
    }
  };

  const { capskit: wrongKit } = await kitFactory({
    capsules: [{ type: 'manifest', manifest: wrongOutputCapsule }],
    warnOnDirectCall: false
  });

  try {
    await wrongKit.call('wrong-output.getUser', { body: {} });
    throw new Error('Should have thrown');
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    if (!error.details.outputValidation) throw new Error('Missing outputValidation flag');
  }
  console.log('✅ Output validation in strict mode works');

  console.log('Test: Output validation skipped when strict is false');
  const nonStrictCapsule = {
    name: 'non-strict',
    version: '1.0.0',
    actions: {
      getData: {
        handler: async () => ({ id: 'string-instead-of-number' }),
        outputSchema: {
          schema: { type: 'object', properties: { id: { type: 'integer' } } },
          strict: false
        },
        metadata: {}
      }
    }
  };

  const { capskit: nonStrictKit } = await kitFactory({
    capsules: [{ type: 'manifest', manifest: nonStrictCapsule }],
    warnOnDirectCall: false
  });

  const nonStrictResult = await nonStrictKit.call('non-strict.getData', { body: {} });
  if (nonStrictResult.id !== 'string-instead-of-number') {
    throw new Error('Non-strict mode should pass through');
  }
  console.log('✅ Output validation skipped when strict is false');

  console.log('✅ All schema validation tests passed!');
}
