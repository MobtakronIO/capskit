import { ValidationError } from '../errors';

export interface FieldError {
  field: string;
  constraint: string;
  message: string;
}

/**
 * Validates a value against a JSON Schema-like schema object.
 *
 * Supported JSON Schema subset:
 * - type: 'object', 'array', 'string', 'number', 'integer', 'boolean', 'null'
 * - required: string[]
 * - properties: Record<string, Schema> (recursive)
 * - additionalProperties: false
 * - items: Schema (for array type, recursive)
 * - enum: unknown[]
 * - nullable: boolean (non-standard, but supported)
 * - String constraints: minLength, maxLength, pattern, format (email, uri, uuid, date-time)
 * - Number constraints: minimum, maximum
 *
 * NOT supported (v4+ features):
 * - oneOf, anyOf, allOf, not
 * - if/then/else
 * - $ref / $defs
 * - const
 * - minItems/maxItems, minProperties/maxProperties
 * - uniqueItems
 * - multipleOf
 * - default
 * - readOnly/writeOnly/deprecated
 */
export function validateSchema(
  payload: unknown,
  schema: Record<string, unknown> | undefined,
  targetName: string,
  isOutput = false,
): void {
  if (!schema) return;

  const raw = payload && typeof payload === 'object' && ('body' in payload || 'query' in payload || 'params' in payload)
    ? payload
    : ((payload as any)?.body ?? payload);
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) && ('body' in raw || 'query' in raw || 'params' in raw)
    ? { ...(raw.body || {}), ...(raw.query || {}), ...(raw.params || {}) }
    : raw;
  const fieldErrors: FieldError[] = [];

  coerceTypes(payload, body, schema);

  validateValue(body, schema, '', fieldErrors);

  if (fieldErrors.length > 0) {
    const prefix = isOutput ? 'Output validation failed' : 'Validation failed';
    const reasons = fieldErrors.map(e => e.message);
    const details: Record<string, any> = { fieldErrors };
    if (isOutput) {
      details.outputValidation = true;
    }
    throw new ValidationError(`${prefix} for ${targetName}: ${reasons.join('; ')}`, details);
  }
}

import { coerceTypes } from './validation/coerce-types.helper';
import {
  validateObject,
  validateArray,
  validateString,
  validateNumber,
} from './validation/type-validators.helper';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return true;
  }
}

function getTypeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function validateValue(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  fieldErrors: FieldError[],
): void {
  // Nullability
  if (value === null) {
    if (schema.nullable === true) return;
  }

  // Enforce top-level type
  if (schema.type && typeof schema.type === 'string') {
    if (!checkType(value, schema.type)) {
      const location = path || 'root';
      fieldErrors.push({
        field: location,
        constraint: 'type',
        message: `Expected type "${schema.type}" at ${location}, got "${getTypeName(value)}"`,
      });
      return;
    }
  }

  // Enum check (applies to any type)
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      const location = path || 'root';
      fieldErrors.push({
        field: location,
        constraint: 'enum',
        message: `\`"${location}"\` must be one of: ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`,
      });
    }
  }

  // Nullability fallback if null is not allowed but we bypassed checkType (e.g. no type specified)
  if (value === null) {
    return;
  }

  // Object validation
  if (isPlainObject(value)) {
    validateObject(value, schema, path, fieldErrors);
  }

  // Array validation
  if (Array.isArray(value) && schema.items) {
    validateArray(value, schema, path, fieldErrors);
  }

  // String constraints
  if (typeof value === 'string') {
    validateString(value, schema, path, fieldErrors);
  }

  // Number constraints
  if (typeof value === 'number' && !Number.isNaN(value)) {
    validateNumber(value, schema, path, fieldErrors);
  }
}
