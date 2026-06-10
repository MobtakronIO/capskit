import { FieldError } from '../validate-schema.helper';
import { validateValue, isPlainObject } from '../validate-schema.helper';

export function validateObject(
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

export function validateArray(
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

export function validateString(
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

export function validateNumber(
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
