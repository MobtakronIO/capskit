/**
 * Validation module for CapsKit kernel.
 * Provides manifest shape validation and input/output schema validation.
 */

import { CapsuleManifest, ActionSchema, OutputValidationOptions, ActionDefinition } from '../types';
import { ValidationError } from './errors';

/**
 * Validate the shape of a capsule manifest.
 * Ensures required fields are present and have correct types.
 */
export function validateManifestShape(manifest: CapsuleManifest): void {
  if (!manifest || typeof manifest !== 'object') {
    throw new ValidationError('Manifest must be an object');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    throw new ValidationError('Manifest must have a string "name" field');
  }

  if (!manifest.actions || typeof manifest.actions !== 'object') {
    throw new ValidationError('Manifest must have an "actions" object');
  }

  // Validate each action definition
  for (const [actionName, actionDef] of Object.entries(manifest.actions)) {
    validateActionDefinition(actionName, actionDef);
  }

  // Validate requires if present
  if (manifest.requires !== undefined) {
    if (!Array.isArray(manifest.requires)) {
      throw new ValidationError('Manifest "requires" must be an array of strings');
    }
    for (const req of manifest.requires) {
      if (typeof req !== 'string') {
        throw new ValidationError(`Manifest "requires" must contain only strings, got: ${typeof req}`);
      }
    }
  }

  // Validate events if present
  if (manifest.events) {
    if (manifest.events.publishes !== undefined) {
      if (!Array.isArray(manifest.events.publishes)) {
        throw new ValidationError('Manifest events.publishes must be an array of strings');
      }
    }
    if (manifest.events.subscribes !== undefined) {
      if (!Array.isArray(manifest.events.subscribes)) {
        throw new ValidationError('Manifest events.subscribes must be an array');
      }
      for (const sub of manifest.events.subscribes) {
        if (!sub.event || !sub.action) {
          throw new ValidationError('Each event subscription must have "event" and "action" fields');
        }
      }
    }
  }
}

/**
 * Validate an individual action definition.
 */
function validateActionDefinition(name: string, def: ActionDefinition): void {
  if (!def.handler) {
    throw new ValidationError(`Action "${name}" must have a handler`);
  }

  if (typeof def.handler !== 'string' && typeof def.handler !== 'function') {
    throw new ValidationError(`Action "${name}" handler must be a string or function`);
  }
}

/**
 * Validate input payload against a JSON schema.
 * Returns a validation result with errors if invalid.
 */
export interface ValidationResult {
  valid: boolean;
  errors: FieldValidationError[];
}

export interface FieldValidationError {
  field: string;
  message: string;
}

export function validateInput(
  input: any,
  schema?: ActionSchema
): ValidationResult {
  if (!schema) {
    return { valid: true, errors: [] };
  }

  const errors: FieldValidationError[] = [];

  if (typeof input !== 'object' || input === null) {
    errors.push({ field: '', message: 'Input must be an object' });
    return { valid: false, errors };
  }

  // Validate required fields
  if (schema.required) {
    for (const requiredField of schema.required) {
      if (!(requiredField in input)) {
        errors.push({ field: requiredField, message: `Field "${requiredField}" is required` });
      }
    }
  }

  // Validate property types
  if (schema.properties) {
    for (const [field, property] of Object.entries(schema.properties)) {
      if (field in input) {
        const value = input[field];
        if (property.type && typeof value !== property.type) {
          errors.push({
            field,
            message: `Field "${field}" expected type ${property.type}, got ${typeof value}`,
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

/**
 * Validate output payload against a JSON schema.
 * Returns the validated output or throws on strict validation failure.
 */
export function validateOutput(
  output: any,
  options?: OutputValidationOptions
): any {
  if (!options || !options.strict) {
    return output;
  }

  const schema = options.schema;
  if (!schema) {
    return output;
  }

  const result = validateInput(output, schema);
  if (!result.valid) {
    const messages = result.errors.map((e) => e.message).join('; ');
    throw new ValidationError(`Output validation failed: ${messages}`);
  }

  return output;
}
