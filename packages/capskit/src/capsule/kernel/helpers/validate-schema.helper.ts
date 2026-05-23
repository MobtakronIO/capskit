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

  const raw = (payload as any)?.body ?? payload;
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) && 'body' in raw && 'query' in raw
    ? { ...(raw.body || {}), ...(raw.query || {}), ...(raw.params || {}) }
    : raw;
  const fieldErrors: FieldError[] = [];

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
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

function validateValue(
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

function validateObject(
  body: Record<string, unknown>,
  schema: Record<string, unknown>,
  path: string,
  fieldErrors: FieldError[],
): void {
  // Required fields
  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required as string[]) {
      if (!(field in body)) {
        const fieldPath = path ? `${path}.${field}` : field;
        fieldErrors.push({
          field: fieldPath,
          constraint: 'required',
          message: `${fieldPath} is required`,
        });
      }
    }
  }

  // Property validation (recursive)
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [field, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
      if (field in body) {
        const fieldPath = path ? `${path}.${field}` : field;
        validateValue(body[field], propSchema as Record<string, unknown>, fieldPath, fieldErrors);
      }
    }
  }

  // Additional properties
  if (schema.additionalProperties === false && schema.properties) {
    const allowed = new Set<string>();
    if (schema.required && Array.isArray(schema.required)) {
      for (const r of schema.required as string[]) allowed.add(r);
    }
    for (const key of Object.keys(schema.properties as Record<string, unknown>)) allowed.add(key);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) {
        const fieldPath = path ? `${path}.${key}` : key;
        fieldErrors.push({
          field: fieldPath,
          constraint: 'additionalProperties:false',
          message: `${fieldPath} is not allowed`,
        });
      }
    }
  }
}

function validateArray(
  value: unknown[],
  schema: Record<string, unknown>,
  path: string,
  fieldErrors: FieldError[],
): void {
  const itemsSchema = schema.items as Record<string, unknown>;
  if (!itemsSchema) return;

  for (let i = 0; i < value.length; i++) {
    const itemPath = `${path}[${i}]`;
    validateValue(value[i], itemsSchema, itemPath, fieldErrors);
  }
}

function validateString(
  value: string,
  schema: Record<string, unknown>,
  path: string,
  fieldErrors: FieldError[],
): void {
  if (schema.minLength !== undefined && value.length < (schema.minLength as number)) {
    fieldErrors.push({
      field: path || 'root',
      constraint: 'minLength',
      message: `\`"${path || 'root'}"\` must have length >= ${schema.minLength}`,
    });
  }
  if (schema.maxLength !== undefined && value.length > (schema.maxLength as number)) {
    fieldErrors.push({
      field: path || 'root',
      constraint: 'maxLength',
      message: `\`"${path || 'root'}"\` must have length <= ${schema.maxLength}`,
    });
  }
  if (schema.pattern) {
    try {
      const re = new RegExp(schema.pattern as string);
      if (!re.test(value)) {
        fieldErrors.push({
          field: path || 'root',
          constraint: 'pattern',
          message: `\`"${path || 'root'}"\` must match pattern: ${schema.pattern}`,
        });
      }
    } catch {
      // ignore invalid regex
    }
  }
  if (schema.format === 'email') {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(value)) {
      fieldErrors.push({
        field: path || 'root',
        constraint: 'format',
        message: `\`"${path || 'root'}"\` must be a valid email`,
      });
    }
  }
  if (schema.format === 'uri') {
    try {
      // eslint-disable-next-line no-new
      new URL(value);
    } catch {
      fieldErrors.push({
        field: path || 'root',
        constraint: 'format',
        message: `\`"${path || 'root'}"\` must be a valid URI`,
      });
    }
  }
  if (schema.format === 'uuid') {
    const uuidRe = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
    if (!uuidRe.test(value)) {
      fieldErrors.push({
        field: path || 'root',
        constraint: 'format',
        message: `\`"${path || 'root'}"\` must be a valid UUID`,
      });
    }
  }
  if (schema.format === 'date-time') {
    if (Number.isNaN(Date.parse(value))) {
      fieldErrors.push({
        field: path || 'root',
        constraint: 'format',
        message: `\`"${path || 'root'}"\` must be a valid date-time`,
      });
    }
  }
}

function validateNumber(
  value: number,
  schema: Record<string, unknown>,
  path: string,
  fieldErrors: FieldError[],
): void {
  if (schema.minimum !== undefined && value < (schema.minimum as number)) {
    fieldErrors.push({
      field: path || 'root',
      constraint: 'minimum',
      message: `${path || 'root'} must be >= ${schema.minimum}`,
    });
  }
  if (schema.maximum !== undefined && value > (schema.maximum as number)) {
    fieldErrors.push({
      field: path || 'root',
      constraint: 'maximum',
      message: `${path || 'root'} must be <= ${schema.maximum}`,
    });
  }
}
