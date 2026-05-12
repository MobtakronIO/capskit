/**
 * Structured error types for CapsKit framework.
 * These errors enable adapters to map failures appropriately without collapsing everything to generic errors.
 * 
 * ## Error Code Taxonomy
 * 
 * Each error code has a specific semantic meaning and HTTP status mapping:
 * 
 * | Code | Status | Usage |
 * |------|--------|-------|
 * | `VALIDATION_ERROR` | 400 | Input validation failures, schema violations, malformed requests |
 * | `NOT_FOUND_ERROR` | 404 | Resource not found, entity does not exist |
 * | `TIMEOUT_ERROR` | 408 | Operation timed out, slow dependency response |
 * | `UNAUTHORIZED_ERROR` | 401 | Authentication required or failed, invalid/missing credentials |
 * | `FORBIDDEN_ERROR` | 403 | Permission denied, authenticated but not permitted |
 * | `TRAIT_ERROR` | 403 | Trait requirement not satisfied, capability not met |
 * | `DEPENDENCY_ERROR` | 500 | External dependency unavailable or failed |
 * | `HANDLER_ERROR` | 500 | Handler execution failed |
 * | `INTERNAL_ERROR` | 500 | Unexpected internal failure |
 * 
 * ## Error Code Usage Guidelines
 * 
 * **VALIDATION_ERROR (400)**
 * Use when: Request body/params fail schema validation, missing required fields,
 *           type mismatches, business rule violations in input.
 * Example: "email field is required", "price must be positive"
 * 
 * **NOT_FOUND_ERROR (404)**
 * Use when: The requested resource does not exist in the system.
 * Example: "User with id '123' not found", "Capsule 'xyz' not found"
 * 
 * **TIMEOUT_ERROR (408)**
 * Use when: An operation exceeded its time limit, typically with external services.
 * Example: "Database query timed out after 30s", "External API did not respond"
 * 
 * **UNAUTHORIZED_ERROR (401)**
 * Use when: No authentication credentials provided, or credentials are invalid.
 * Example: "Invalid API key", "Token has expired", "Missing authorization header"
 * 
 * **FORBIDDEN_ERROR (403)**
 * Use when: User is authenticated but lacks permission for the requested action.
 * Example: "User cannot delete this resource", "Insufficient role for this operation"
 * 
 * **TRAIT_ERROR (403)**
 * Use when: A specific capability/trait requirement is not satisfied.
 * Example: "User does not have 'admin' trait", "Required trait 'billing:write' missing"
 * 
 * **DEPENDENCY_ERROR (500)**
 * Use when: An external service/database/cache is unavailable or behaving unexpectedly.
 * Example: "Database connection refused", "Redis unavailable", "External API returned 503"
 * 
 * **HANDLER_ERROR (500)**
 * Use when: A handler function throws an error during execution.
 * Includes the action name for debugging.
 * Example: "Handler 'createUser' failed: unique constraint violation"
 * 
 * **INTERNAL_ERROR (500)**
 * Use when: An unexpected error occurs that doesn't fit other categories.
 * Example: "Unexpected null value in processing", "Unknown state encountered"
 * 
 * ## Canonical Error Envelope
 * 
 * All framework errors conform to this shape when serialized for transport:
 * ```typescript
 * {
 *   code: string;        // Machine-readable error code (e.g., "VALIDATION_ERROR")
 *   message: string;     // Human-readable message (safe for production)
 *   status?: number;    // HTTP status code (optional, for HTTP adapters)
 *   details?: object;   // Additional context (development only by default)
 *   stack?: string;     // Stack trace (development only by default)
 * }
 * ```
 * 
 * ## Environment-Based Stack Exposure
 * 
 * Stack traces are ONLY exposed when `NODE_ENV !== 'production'`.
 * In production, `details` and `stack` are omitted to prevent information leakage.
 * 
 * ## Adapters
 * 
 * All adapters (HTTP, WebSocket, etc.) MUST use `toErrorEnvelope()` from this module
 * to ensure consistent error responses across all transport layers.
 */

/**
 * Environment-based stack visibility policy.
 * Stack traces are only exposed in non-production environments.
 */
export function shouldExposeStack(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Get safe error message for production.
 * Returns a generic message for unknown errors in production to avoid leaking implementation details.
 */
export function getSafeErrorMessage(error: Error, isFrameworkError: boolean): string {
  if (isFrameworkError) {
    return error.message;
  }
  return process.env.NODE_ENV === 'production' 
    ? 'An unexpected error occurred' 
    : error.message;
}

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
  
  /**
   * Convert to canonical error envelope.
   * Respects environment-based stack visibility.
   */
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

/**
 * Canonical error envelope structure.
 * All framework errors must conform to this shape when serialized for transport.
 */
export interface ErrorEnvelope {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, any>;
  stack?: string;
}

/**
 * Create an ErrorEnvelope from any error (framework or native).
 * Used by adapters to ensure consistent error response shape.
 * 
 * Uses duck-typing via isFrameworkError property to handle module boundary issues
 * where FrameworkError from dist may not instanceof source FrameworkError.
 */
export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  // Duck-typing check: FrameworkError instances have isFrameworkError = true
  // This works across module boundaries where instanceof may fail
  if ((error as any)?.isFrameworkError === true) {
    // If it has a toEnvelope method (proper FrameworkError), use it
    if (typeof (error as any).toEnvelope === 'function') {
      return (error as FrameworkError).toEnvelope();
    }
    // Otherwise, extract properties directly from duck-typed object
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
  
  // Non-Error throwables
  return {
    code: 'UNKNOWN_ERROR',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : String(error),
    status: 500
  };
}

/**
 * Check if an error is a recognized native JavaScript Error type.
 * Used to preserve error names like "TypeError", "RangeError" etc.
 */
function isRecognizedNativeError(error: Error): boolean {
  const knownTypes = [
    'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError',
    'URIError', 'EvalError', 'InternalError', 'AggregateError'
  ];
  return knownTypes.includes(error.name);
}

/**
 * Error thrown when request input fails validation.
 * 
 * Use when: Request body, query parameters, or path parameters fail schema validation
 * or violate business rules. This includes missing required fields, type mismatches,
 * format violations (e.g., invalid email), and range violations.
 * 
 * @example
 * throw new ValidationError("email must be a valid email address", { field: "email", value: "not-an-email" });
 */
export class ValidationError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when a requested resource does not exist.
 * 
 * Use when: The resource, entity, or capsule referenced in the request
 * cannot be found in the system. This is different from authorization errors
 * where a resource exists but the user cannot access it.
 * 
 * @example
 * throw new NotFoundError("User with id '123' not found");
 */
export class NotFoundError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'NOT_FOUND_ERROR', 404, details);
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when an operation exceeds its time limit.
 * 
 * Use when: An operation (typically involving external services) does not complete
 * within the expected time. This includes slow database queries, unresponsive
 * external APIs, and long-running operations that exceed configured timeouts.
 * 
 * @example
 * throw new TimeoutError("Database query timed out after 30000ms", { operation: "SELECT users", duration: 30000 });
 */
export class TimeoutError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'TIMEOUT_ERROR', 408, details);
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when an external dependency is unavailable or fails.
 * 
 * Use when: An external service, database, cache, or other dependency
 * that the application relies on is unavailable, returns an error, or
 * behaves in an unexpected way. This distinguishes from timeouts (see TimeoutError)
 * and indicates a dependency failure rather than just slowness.
 * 
 * @example
 * throw new DependencyError("Database connection refused", { dependency: "postgres", host: "db.example.com" });
 */
export class DependencyError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'DEPENDENCY_ERROR', 500, details);
    this.name = 'DependencyError';
  }
}

/**
 * Error thrown when authentication is required but missing or invalid.
 * 
 * Use when: The request does not include valid authentication credentials,
 * the credentials are malformed, expired, or invalid. This indicates
 * an authentication failure rather than an authorization (permission) failure.
 * 
 * @example
 * throw new UnauthorizedError("Invalid API key provided", { providedKey: "xxx...xxx" });
 */
export class UnauthorizedError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'UNAUTHORIZED_ERROR', 401, details);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error thrown when the user lacks permission to perform an action.
 * 
 * Use when: The user is authenticated but does not have the necessary
 * permissions/roles to perform the requested action. Compare with
 * UnauthorizedError which indicates missing/invalid authentication.
 * 
 * @example
 * throw new AuthorizationError("User cannot delete this resource", { userId: "123", resource: "Post", action: "delete" });
 */
export class AuthorizationError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'FORBIDDEN_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Error thrown when a required trait/capability is not satisfied.
 * 
 * Use when: The requester does not possess a specific capability or trait
 * required by the handler. This is a specialized form of authorization
 * that checks for specific capabilities rather than generic permissions.
 * 
 * @example
 * throw new TraitError("User lacks required 'billing:write' trait", "billing:write", { required: "billing:write" });
 */
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

/**
 * Error thrown when a handler function fails during execution.
 * 
 * Use when: A capsule handler throws an unexpected error during its execution.
 * This distinguishes handler-specific failures from system-level errors (see InternalError).
 * Includes the action name for easier debugging and error tracking.
 * 
 * @example
 * throw new HandlerError("User creation failed: email already exists", "createUser", { email: "user@example.com" });
 */
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

/**
 * Error thrown when an unexpected internal failure occurs.
 * 
 * Use when: An unexpected error condition is encountered that doesn't fit
 * any of the other error categories. This should be used sparingly as it
 * indicates a situation the code didn't anticipate. Prefer more specific
 * error types when possible.
 * 
 * @example
 * throw new InternalError("Unexpected null value encountered in user processing", { context: "getUserById", location: "userService.ts:42" });
 */
export class InternalError extends FrameworkError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'INTERNAL_ERROR', 500, details);
    this.name = 'InternalError';
  }
}
