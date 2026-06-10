export function shouldExposeStack(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function getSafeErrorMessage(error: Error, isFrameworkError: boolean): string {
  if (isFrameworkError) {
    return error.message;
  }
  return process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : error.message;
}

export interface ErrorEnvelope {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
  stack?: string;
}

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
      ...(this.details && Object.keys(this.details).length > 0
        ? { details: shouldExposeStack() ? this.details : undefined }
        : {}),
      ...(shouldExposeStack() && this.stack ? { stack: this.stack } : {})
    };
  }
}

function isRecognizedNativeError(error: Error): boolean {
  const knownTypes = [
    'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError',
    'URIError', 'EvalError', 'InternalError', 'AggregateError'
  ];
  return knownTypes.includes(error.name);
}

export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  if ((error as any)?.isFrameworkError === true) {
    if (typeof (error as any).toEnvelope === 'function') {
      return (error as FrameworkError).toEnvelope();
    }
    return {
      code: (error as any).code || 'UNKNOWN_ERROR',
      message: (error as any).message || 'Unknown framework error',
      status: (error as any).status || 500,
      ...(error instanceof Error && shouldExposeStack() && error.stack ? { stack: error.stack } : {})
    };
  }

  if (error instanceof Error) {
    const isKnown = isRecognizedNativeError(error);
    return {
      code: isKnown ? error.name : 'UNKNOWN_ERROR',
      message: getSafeErrorMessage(error, false),
      status: 500,
      ...(shouldExposeStack() && error.stack ? { stack: error.stack } : {})
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : String(error),
    status: 500
  };
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
  public cycle: string[];
  constructor(message: string, cycle: string[]) {
    super(message);
    this.name = 'CycleError';
    this.cycle = cycle;
  }
}

export class CapLoadError extends Error {
  public readonly filePath?: string;
  constructor(message: string, filePath?: string) {
    super(message);
    this.name = 'CapLoadError';
    this.filePath = filePath;
  }
}

export class DuplicateCapNameError extends CapLoadError {
  public readonly duplicates: string[];
  constructor(duplicates: string[], context: string) {
    const names = duplicates.join(', ');
    super(
      `Duplicate cap name(s) detected in ${context}: ${names}. ` +
        `Each cap must have a unique name within its capsule/context.`
    );
    this.name = 'DuplicateCapNameError';
    this.duplicates = duplicates;
  }
}

export class CapCycleError extends CapLoadError {
  public readonly cycle: string[];
  constructor(cycle: string[], context: string) {
    const cycleStr = cycle.join(' → ');
    super(
      `Dependency cycle detected in ${context}: ${cycleStr}. ` +
        `Caps cannot depend on each other circularly.`
    );
    this.name = 'CapCycleError';
    this.cycle = cycle;
  }
}


export class TraitError extends FrameworkError {
  constructor(message: string, public readonly trait: string, details?: Record<string, unknown>) {
    super(message, 'TRAIT_ERROR', 403, details);
    this.name = 'TraitError';
  }
}

export class HandlerError extends FrameworkError {
  constructor(message: string, public readonly actionName: string, details?: Record<string, unknown>) {
    super(message, 'HANDLER_ERROR', 500, details);
    this.name = 'HandlerError';
  }
}
