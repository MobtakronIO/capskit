import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError } from '../errors';

export interface FieldError {
  field: string;
  constraint: string;
  message: string;
}

export { FieldError };

const ajv = new Ajv({ allErrors: true, coerceTypes: true, useDefaults: false });
addFormats(ajv);

const schemaCache = new WeakMap<Record<string, unknown>, ValidateFunction>();

function getValidator(schema: Record<string, unknown>): ValidateFunction {
  let validate = schemaCache.get(schema);
  if (validate) return validate;
  validate = ajv.compile(schema);
  schemaCache.set(schema, validate);
  return validate;
}

function extractPayload(payload: unknown): { body: Record<string, unknown>; raw: unknown } {
  if (payload && typeof payload === 'object' && ('body' in payload || 'query' in payload || 'params' in payload)) {
    const raw = payload as Record<string, unknown>;
    const body = { ...(raw.body || {}), ...(raw.query || {}), ...(raw.params || {}) };
    return { body, raw: payload };
  }
  return { body: (payload as any)?.body ?? payload ?? {}, raw: payload };
}

export function validateSchema(
  payload: unknown,
  schema: Record<string, unknown> | undefined,
  targetName: string,
  isOutput = false,
): void {
  if (!schema) return;

  const { body, raw } = extractPayload(payload);

  const validate = getValidator(schema);
  const valid = validate(body);

  if (!valid && validate.errors) {
    const fieldErrors: FieldError[] = validate.errors.map(err => {
      let field = err.instancePath ? err.instancePath.slice(1) : 'root';
      let constraint = err.keyword;
      let message = err.message || `${field} ${err.keyword}`;

      if (err.keyword === 'required' && err.params?.missingProperty) {
        field = err.params.missingProperty as string;
        constraint = 'required';
        message = `${field} is required`;
      } else if (err.keyword === 'additionalProperties' && err.params?.additionalProperty) {
        field = err.params.additionalProperty as string;
        constraint = 'additionalProperties:false';
        message = `${field} is not allowed`;
      } else if (err.keyword === 'enum') {
        constraint = 'enum';
      } else if (err.keyword === 'type') {
        constraint = 'type';
      } else if (err.keyword === 'format') {
        constraint = 'format';
      } else if (err.keyword === 'pattern') {
        constraint = 'pattern';
      } else if (err.keyword === 'minimum' || err.keyword === 'exclusiveMinimum') {
        constraint = 'minimum';
      } else if (err.keyword === 'maximum' || err.keyword === 'exclusiveMaximum') {
        constraint = 'maximum';
      } else if (err.keyword === 'minLength') {
        constraint = 'minLength';
      } else if (err.keyword === 'maxLength') {
        constraint = 'maxLength';
      }

      return { field, constraint, message };
    });

    const prefix = isOutput ? 'Output validation failed' : 'Validation failed';
    const reasons = fieldErrors.map(e => e.message);
    const details: Record<string, any> = { fieldErrors };
    if (isOutput) {
      details.outputValidation = true;
    }
    throw new ValidationError(`${prefix} for ${targetName}: ${reasons.join('; ')}`, details);
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const rawObj = raw as Record<string, unknown>;
    const mergedKeys = new Set(Object.keys(body));
    if ('body' in rawObj && rawObj.body && typeof rawObj.body === 'object') {
      const rawBody = rawObj.body as Record<string, unknown>;
      for (const key of mergedKeys) {
        if (key in rawBody) rawBody[key] = body[key];
      }
    }
    if ('query' in rawObj && rawObj.query && typeof rawObj.query === 'object') {
      const rawQuery = rawObj.query as Record<string, unknown>;
      for (const key of mergedKeys) {
        if (key in rawQuery) rawQuery[key] = body[key];
      }
    }
    if ('params' in rawObj && rawObj.params && typeof rawObj.params === 'object') {
      const rawParams = rawObj.params as Record<string, unknown>;
      for (const key of mergedKeys) {
        if (key in rawParams) rawParams[key] = body[key];
      }
    }
  }
}