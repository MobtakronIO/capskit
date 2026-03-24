/**
 * Structured error types for CapsKit framework.
 * These errors enable adapters to map failures appropriately without collapsing everything to generic errors.
 */

export class FrameworkError extends Error {
  public readonly isFrameworkError = true;
  
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'FrameworkError';
  }
}

export class ValidationError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'NOT_FOUND_ERROR', 404, details);
    this.name = 'NotFoundError';
  }
}

export class DependencyError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'DEPENDENCY_ERROR', 500, details);
    this.name = 'DependencyError';
  }
}

export class AuthorizationError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

export class TraitError extends FrameworkError {
  constructor(
    message: string,
    public readonly trait: string,
    details?: Record<string, any>
  ) {
    super(message, 'TRAIT_ERROR', 403, details);
    this.name = 'TraitError';
  }
}

export class HandlerError extends FrameworkError {
  constructor(
    message: string,
    public readonly actionName: string,
    details?: Record<string, any>
  ) {
    super(message, 'HANDLER_ERROR', 500, details);
    this.name = 'HandlerError';
  }
}
