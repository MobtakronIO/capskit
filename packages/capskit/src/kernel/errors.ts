// Errors compatibility shim - self-contained to avoid module resolution issues

export class FrameworkError extends Error {
  public readonly isFrameworkError = true;
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FrameworkError';
  }

  toEnvelope(): ErrorEnvelope {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
    };
  }
}

export class ValidationError extends FrameworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends FrameworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND_ERROR', 404, details);
    this.name = 'NotFoundError';
  }
}

export class TimeoutError extends FrameworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TIMEOUT_ERROR', 408, details);
    this.name = 'TimeoutError';
  }
}

export class DependencyError extends FrameworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DEPENDENCY_ERROR', 500, details);
    this.name = 'DependencyError';
  }
}

export class UnauthorizedError extends FrameworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'UNAUTHORIZED_ERROR', 401, details);
    this.name = 'UnauthorizedError';
  }
}

export class AuthorizationError extends FrameworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'FORBIDDEN_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

export class InternalError extends FrameworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INTERNAL_ERROR', 500, details);
    this.name = 'InternalError';
  }
}

export class CycleError extends Error {
  constructor(message: string, public cycle: string[]) {
    super(message);
    this.name = 'CycleError';
  }
}

export class CapLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapLoadError';
  }
}

export class TraitError extends FrameworkError {
  public readonly trait?: string;
  constructor(message: string, trait?: string, details?: Record<string, unknown>) {
    super(message, 'TRAIT_ERROR', 403, details);
    this.name = 'TraitError';
    this.trait = trait;
  }
}

export class HandlerError extends FrameworkError {
  public readonly actionName?: string;
  constructor(message: string, actionName?: string, details?: Record<string, unknown>) {
    super(message, 'HANDLER_ERROR', 500, details);
    this.name = 'HandlerError';
    this.actionName = actionName;
  }
}

export interface ErrorEnvelope {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
  stack?: string;
}

export function shouldExposeStack(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function getSafeErrorMessage(error: Error, isFrameworkError: boolean): string {
  if (isFrameworkError) return error.message;
  return process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message;
}

export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  if ((error as any)?.isFrameworkError === true) {
    return {
      code: (error as any).code || 'UNKNOWN_ERROR',
      message: (error as any).message || 'Unknown framework error',
      status: (error as any).status || 500,
    };
  }
  if (error instanceof Error) {
    return { code: 'UNKNOWN_ERROR', message: error.message, status: 500 };
  }
  return { code: 'UNKNOWN_ERROR', message: String(error), status: 500 };
}
