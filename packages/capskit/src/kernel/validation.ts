/**
 * Validation module for CapsKit kernel.
 * Provides manifest shape validation and input/output schema validation.
 *
 * All validation logic lives here — platform.ts delegates to these functions
 * instead of duplicating them as private methods.
 */

import { CapsuleManifest, ActionSchema, OutputValidationOptions, ActionDefinition, FieldValidationError, ValidationResult } from '../types';
import { ValidationError, DependencyError } from './errors';

// ---------------------------------------------------------------------------
// Manifest Shape Validation
// ---------------------------------------------------------------------------

/**
 * Validate the shape and structure of a capsule manifest.
 * Ensures required fields are present, correctly typed, and follow naming conventions.
 * Throws ValidationError on any issue.
 */
export function validateManifestShape(manifest: CapsuleManifest): void {
  if (!manifest || typeof manifest !== 'object') {
    throw new ValidationError('Manifest must be an object');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    throw new ValidationError('Capsule manifest must have a name.');
  }

  // Validate name format (alphanumeric, dashes, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(manifest.name)) {
    throw new ValidationError(
      `Capsule "${manifest.name}" has an invalid name. ` +
      `Names must contain only alphanumeric characters, dashes, and underscores.`
    );
  }

  if (!manifest.actions || typeof manifest.actions !== 'object' || Array.isArray(manifest.actions)) {
    throw new ValidationError(`Capsule "${manifest.name}" must have an actions object.`);
  }

  // Check for empty actions
  const actionKeys = Object.keys(manifest.actions);
  if (actionKeys.length === 0) {
    throw new ValidationError(`Capsule "${manifest.name}" must have at least one action.`);
  }

  // Validate action definitions
  for (const [actionName, def] of Object.entries(manifest.actions)) {
    // Validate action name format
    if (!/^[a-zA-Z0-9_-]+$/.test(actionName)) {
      throw new ValidationError(
        `Action "${manifest.name}.${actionName}" has an invalid name. ` +
        `Action names must contain only alphanumeric characters, dashes, and underscores.`
      );
    }
    if (!def || typeof def !== 'object') {
      throw new ValidationError(`Action "${manifest.name}.${actionName}" must be an object with a handler.`);
    }
    if (!def.handler) {
      throw new ValidationError(`Action "${manifest.name}.${actionName}" must have a handler.`);
    }
    if (typeof def.handler !== 'string' && typeof def.handler !== 'function') {
      throw new ValidationError(
        `Action "${manifest.name}.${actionName}" has an invalid handler type. ` +
        `Handler must be a function or a string path to a module.`
      );
    }
  }

  // Validate requires if present
  if (manifest.requires !== undefined) {
    if (!Array.isArray(manifest.requires)) {
      throw new ValidationError(`Capsule "${manifest.name}" requires must be an array.`);
    }
    for (const dep of manifest.requires) {
      if (typeof dep !== 'string') {
        throw new ValidationError(`Capsule "${manifest.name}" has invalid requires entry: must be strings.`);
      }
    }
  }

  // Validate events structure if present
  if (manifest.events !== undefined) {
    if (typeof manifest.events !== 'object' || Array.isArray(manifest.events)) {
      throw new ValidationError(`Capsule "${manifest.name}" events must be an object.`);
    }

    // Validate event subscriptions if present
    if (manifest.events.subscribes !== undefined) {
      if (!Array.isArray(manifest.events.subscribes)) {
        throw new ValidationError(`Capsule "${manifest.name}" events.subscribes must be an array.`);
      }
      for (const sub of manifest.events.subscribes) {
        if (!sub || typeof sub !== 'object') {
          throw new ValidationError(`Invalid event subscription in capsule "${manifest.name}": must be an object with event and action.`);
        }
        if (typeof sub.event !== 'string' || !sub.event) {
          throw new ValidationError(`Invalid event subscription in capsule "${manifest.name}": event must be a non-empty string.`);
        }
        if (typeof sub.action !== 'string' || !sub.action) {
          throw new ValidationError(`Invalid event subscription in capsule "${manifest.name}": action must be a non-empty string.`);
        }
      }
    }

    // Validate event publishes if present
    if (manifest.events.publishes !== undefined) {
      if (!Array.isArray(manifest.events.publishes)) {
        throw new ValidationError(`Capsule "${manifest.name}" events.publishes must be an array.`);
      }
      for (const ev of manifest.events.publishes) {
        if (typeof ev !== 'string' || !ev) {
          throw new ValidationError(`Invalid event name in capsule "${manifest.name}" publishes: must be non-empty strings.`);
        }
      }
    }
  }
}

/**
 * Validate that all required dependencies for a manifest are present in the given deps map.
 * Throws DependencyError if any required dependency is missing.
 */
export function validateManifestDependencies(
  manifest: CapsuleManifest,
  deps: Record<string, any>,
): void {
  if (manifest.requires) {
    for (const dep of manifest.requires) {
      if (!(dep in deps)) {
        throw new DependencyError(
          `Capsule "${manifest.name}" requires dependency "${dep}" which is not provided.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Input Payload Validation
// ---------------------------------------------------------------------------

/**
 * Validate an input payload against a JSON Schema (subset of draft-07).
 * Throws ValidationError with detailed field errors on failure.
 *
 * Supports:
 * - Required fields
 * - Type validation (string, number, integer, boolean, array, object)
 * - Format validation (email, uri, date-time, date, uuid)
 * - String constraints (minLength, maxLength, pattern)
 * - Number constraints (minimum, maximum)
 * - Enum validation
 * - Array item type validation
 * - additionalProperties: false
 * - Nullable fields
 */
export function validatePayload(
  schema: ActionSchema | undefined,
  payload: any,
  actionName: string,
): void {
  if (!schema) return;

  if (schema.type && schema.type !== 'object') {
    throw new ValidationError(
      `Schema type '${schema.type}' not supported for action ${actionName}. Only 'object' is supported.`
    );
  }

  const errors: FieldValidationError[] = [];

  // Check required fields
  if (schema.required && Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (payload?.[key] === undefined) {
        errors.push({
          field: key,
          message: `Field '${key}' is required`,
          constraint: 'required',
          value: undefined,
        });
      }
    }
  }

  // Type and constraint validation against schema.properties
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const value = payload?.[key];

      // Skip validation if value is undefined and field is not required
      if (value === undefined) continue;

      const prop = propSchema as any;
      if (!prop || typeof prop !== 'object') continue;

      // Type validation
      if (prop.type) {
        const expectedType = prop.type;
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (prop.nullable && value === null) {
          // null is allowed
        } else if (expectedType === 'array') {
          if (!Array.isArray(value)) {
            errors.push({
              field: key,
              message: `Field '${key}' must be an array, got ${actualType}`,
              constraint: `type:${expectedType}`,
              value,
            });
          }
        } else if (expectedType === 'integer') {
          if (typeof value !== 'number' || !Number.isInteger(value)) {
            errors.push({
              field: key,
              message: `Field '${key}' must be an integer, got ${actualType}`,
              constraint: `type:${expectedType}`,
              value,
            });
          }
        } else if (expectedType !== actualType) {
          errors.push({
            field: key,
            message: `Field '${key}' must be of type ${expectedType}, got ${actualType}`,
            constraint: `type:${expectedType}`,
            value,
          });
        }
      }

      // Format validation (only for strings)
      if (prop.format && typeof value === 'string') {
        if (prop.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push({
            field: key,
            message: `Field '${key}' must be a valid email address`,
            constraint: `format:${prop.format}`,
            value,
          });
        } else if (prop.format === 'uri' && !/^https?:\/\//.test(value)) {
          errors.push({
            field: key,
            message: `Field '${key}' must be a valid URI`,
            constraint: `format:${prop.format}`,
            value,
          });
        } else if (prop.format === 'date-time' && isNaN(Date.parse(value))) {
          errors.push({
            field: key,
            message: `Field '${key}' must be a valid ISO 8601 date-time string`,
            constraint: `format:${prop.format}`,
            value,
          });
        } else if (prop.format === 'date' && isNaN(Date.parse(value))) {
          errors.push({
            field: key,
            message: `Field '${key}' must be a valid date string`,
            constraint: `format:${prop.format}`,
            value,
          });
        } else if (prop.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
          errors.push({
            field: key,
            message: `Field '${key}' must be a valid UUID`,
            constraint: `format:${prop.format}`,
            value,
          });
        }
      }

      // String constraints
      if (typeof value === 'string') {
        if (prop.minLength !== undefined && value.length < prop.minLength) {
          errors.push({
            field: key,
            message: `Field '${key}' must be at least ${prop.minLength} characters long`,
            constraint: `minLength:${prop.minLength}`,
            value,
          });
        }
        if (prop.maxLength !== undefined && value.length > prop.maxLength) {
          errors.push({
            field: key,
            message: `Field '${key}' must be at most ${prop.maxLength} characters long`,
            constraint: `maxLength:${prop.maxLength}`,
            value,
          });
        }
        if (prop.pattern) {
          const regex = new RegExp(prop.pattern);
          if (!regex.test(value)) {
            errors.push({
              field: key,
              message: `Field '${key}' does not match the required pattern`,
              constraint: `pattern:${prop.pattern}`,
              value,
            });
          }
        }
      }

      // Number constraints
      if (typeof value === 'number') {
        if (prop.minimum !== undefined && value < prop.minimum) {
          errors.push({
            field: key,
            message: `Field '${key}' must be at least ${prop.minimum}`,
            constraint: `minimum:${prop.minimum}`,
            value,
          });
        }
        if (prop.maximum !== undefined && value > prop.maximum) {
          errors.push({
            field: key,
            message: `Field '${key}' must be at most ${prop.maximum}`,
            constraint: `maximum:${prop.maximum}`,
            value,
          });
        }
      }

      // Enum validation
      if (prop.enum && Array.isArray(prop.enum)) {
        if (!prop.enum.includes(value)) {
          errors.push({
            field: key,
            message: `Field '${key}' must be one of: ${prop.enum.join(', ')}`,
            constraint: `enum:${JSON.stringify(prop.enum)}`,
            value,
          });
        }
      }

      // Array items validation
      if (prop.items && Array.isArray(value)) {
        const itemSchema = prop.items;
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (itemSchema.type) {
            const expectedItemType = itemSchema.type;
            const actualItemType = typeof item;

            if (expectedItemType === 'integer') {
              if (typeof item !== 'number' || !Number.isInteger(item)) {
                errors.push({
                  field: `${key}[${i}]`,
                  message: `Item at index ${i} in '${key}' must be an integer`,
                  constraint: `type:${expectedItemType}`,
                  value: item,
                });
              }
            } else if (expectedItemType !== actualItemType) {
              errors.push({
                field: `${key}[${i}]`,
                message: `Item at index ${i} in '${key}' must be of type ${expectedItemType}`,
                constraint: `type:${expectedItemType}`,
                value: item,
              });
            }
          }
        }
      }
    }
  }

  // Check additionalProperties
  if (schema.additionalProperties === false && schema.properties && payload && typeof payload === 'object') {
    const allowedKeys = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(payload)) {
      if (!allowedKeys.has(key)) {
        errors.push({
          field: key,
          message: `Field '${key}' is not allowed. Allowed fields: ${Array.from(allowedKeys).join(', ')}`,
          constraint: 'additionalProperties:false',
          value: payload[key],
        });
      }
    }
  }

  // Throw validation error if any errors found
  if (errors.length > 0) {
    throw new ValidationError(
      `Input validation failed for action ${actionName}: ${errors.map(e => e.message).join('; ')}`,
      { fieldErrors: errors, action: actionName },
    );
  }
}

// ---------------------------------------------------------------------------
// Output Validation
// ---------------------------------------------------------------------------

/**
 * Validate handler output against an output schema.
 * Throws ValidationError if validation fails in strict mode.
 */
export function validateOutput(
  output: any,
  outputSchema: OutputValidationOptions | undefined,
  actionName: string,
): void {
  if (!outputSchema || !outputSchema.strict) return;

  const schema = outputSchema.schema;
  if (!schema) return;

  try {
    validatePayload(schema, output, actionName);
  } catch (error: any) {
    if (error.code === 'VALIDATION_ERROR') {
      throw new ValidationError(
        `Output validation failed for action ${actionName}: ${error.message}`,
        { ...error.details, outputValidation: true },
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Legacy: standalone validateInput (simpler version for public API usage)
// ---------------------------------------------------------------------------

/**
 * Standalone input validation function for public API usage.
 * Returns a ValidationResult instead of throwing.
 * Used by adapter packages and external consumers.
 */
export function validateInput(
  input: any,
  schema?: ActionSchema,
): ValidationResult {
  if (!schema) {
    return { valid: true, errors: [] };
  }

  const errors: FieldValidationError[] = [];

  if (typeof input !== 'object' || input === null) {
    errors.push({ field: '', message: 'Input must be an object', constraint: 'type', value: input });
    return { valid: false, errors };
  }

  if (schema.required) {
    for (const requiredField of schema.required) {
      if (!(requiredField in input)) {
        errors.push({ field: requiredField, message: `Field "${requiredField}" is required`, constraint: 'required', value: undefined });
      }
    }
  }

  if (schema.properties) {
    for (const [field, property] of Object.entries(schema.properties)) {
      if (field in input) {
        const value = input[field];
        if (property.type && typeof value !== property.type) {
          errors.push({
            field,
            message: `Field "${field}" expected type ${property.type}, got ${typeof value}`,
            constraint: `type:${property.type}`,
            value,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
