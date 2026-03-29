/**
 * Centralized error mapping utilities for CapsKit adapters.
 * Provides consistent error handling patterns across HTTP, WebSocket, and other transports.
 * 
 * All adapters MUST use these utilities to ensure consistent error responses.
 * The transport layer must NOT invent custom error formats.
 */

// Re-export all error classes and utilities from errors module
export {
  FrameworkError,
  toErrorEnvelope,
  shouldExposeStack,
  getSafeErrorMessage,
  ValidationError,
  NotFoundError,
  TimeoutError,
  DependencyError,
  UnauthorizedError,
  AuthorizationError,
  TraitError,
  HandlerError,
  InternalError
} from './errors';

// Re-export ErrorEnvelope as a type (interfaces don't exist at runtime)
export type { ErrorEnvelope } from './errors';

import { 
  FrameworkError, 
  ErrorEnvelope, 
  toErrorEnvelope, 
  shouldExposeStack,
  getSafeErrorMessage,
  ValidationError,
  NotFoundError,
  TimeoutError,
  DependencyError,
  UnauthorizedError,
  AuthorizationError,
  TraitError,
  HandlerError,
  InternalError
} from './errors';

/**
 * Error code to HTTP status mapping.
 * Used by HTTP adapters to set the appropriate response status.
 */
export const ERROR_STATUS_MAP: Record<string, number> = {
  'VALIDATION_ERROR': 400,
  'NOT_FOUND_ERROR': 404,
  'TIMEOUT_ERROR': 408,
  'UNAUTHORIZED_ERROR': 401,
  'FORBIDDEN_ERROR': 403,
  'TRAIT_ERROR': 403,
  'DEPENDENCY_ERROR': 500,
  'HANDLER_ERROR': 500,
  'INTERNAL_ERROR': 500,
  'UNKNOWN_ERROR': 500
};

/**
 * All framework error classes indexed by code.
 * Used for error reconstruction and type checking.
 */
export const FRAMEWORK_ERRORS = {
  ValidationError,
  NotFoundError,
  TimeoutError,
  DependencyError,
  UnauthorizedError,
  AuthorizationError,
  TraitError,
  HandlerError,
  InternalError
} as const;

/**
 * Mapping from error codes to framework error classes.
 * This allows looking up the correct class given an error code string.
 */
export const ERROR_CODE_TO_CLASS: Record<string, any> = {
  'VALIDATION_ERROR': ValidationError,
  'NOT_FOUND_ERROR': NotFoundError,
  'TIMEOUT_ERROR': TimeoutError,
  'DEPENDENCY_ERROR': DependencyError,
  'UNAUTHORIZED_ERROR': UnauthorizedError,
  'FORBIDDEN_ERROR': AuthorizationError,
  'TRAIT_ERROR': TraitError,
  'HANDLER_ERROR': HandlerError,
  'INTERNAL_ERROR': InternalError
};

/**
 * Type for framework error constructor types.
 */
export type FrameworkErrorClass = {
  new(message: string, details?: Record<string, any>): FrameworkError;
};

/**
 * Map an error code string to its corresponding framework error class.
 * Returns undefined if the code is not a recognized framework error code.
 */
export function getErrorClassByCode(code: string): FrameworkErrorClass | undefined {
  return ERROR_CODE_TO_CLASS[code] as FrameworkErrorClass ?? undefined;
}

/**
 * Get HTTP status code for a framework error.
 * Falls back to 500 for unknown errors.
 */
export function getHttpStatus(error: FrameworkError | { code: string; status?: number }): number {
  if (error instanceof FrameworkError && error.status) {
    return error.status;
  }
  return ERROR_STATUS_MAP[error.code] ?? 500;
}

/**
 * Map a FrameworkError to an appropriate HTTP response.
 * Returns a response object with error details and appropriate status.
 *
 * @param error - The error to map
 * @param set - Elysia's set object to modify status (optional, can be undefined for generic mapping)
 * @returns Object with error message and optional details/stack
 */
export function mapToHttpResponse(error: unknown, set?: { status?: number }): ErrorEnvelope {
  const envelope = toErrorEnvelope(error);
  
  if (set && envelope.status) {
    set.status = envelope.status;
  }
  
  return envelope;
}

/**
 * Handle errors in WebSocket handlers with appropriate responses.
 * Uses the canonical error envelope for consistent error reporting.
 *
 * @param error - The error to handle
 * @param ws - The WebSocket connection
 * @param handlerType - Type of handler ('open'|'message'|'close'|'drain')
 */
export function handleWebSocketError(error: unknown, ws: any, handlerType: 'open' | 'message' | 'close' | 'drain'): void {
  const envelope = toErrorEnvelope(error);
  const errorJson = JSON.stringify(envelope);

  // Duck-typing check: FrameworkError instances have isFrameworkError = true
  // This works across module boundaries where instanceof may fail
  if ((error as any)?.isFrameworkError === true && envelope.status) {
    switch (handlerType) {
      case 'open':
        // Can't send message on open failure, close connection with error code
        ws.close(1011, envelope.message);
        break;
      case 'message':
        ws.send(errorJson);
        break;
      case 'close':
      case 'drain':
        // Log but don't attempt to send on closing/drain
        console.error(`[WebSocket] Error in ${handlerType} handler:`, envelope.message);
        break;
    }
  } else {
    // Unknown or internal errors
    switch (handlerType) {
      case 'open':
        ws.close(1011, process.env.NODE_ENV === 'production' ? 'Internal server error' : envelope.message);
        break;
      case 'message':
        ws.send(errorJson);
        break;
      case 'close':
      case 'drain':
        console.error(`[WebSocket] Error in ${handlerType} handler:`, envelope.message);
        break;
    }
  }
}

/**
 * Check if an error is a FrameworkError with a specific status code.
 *
 * @param error - The error to check
 * @param status - The HTTP status code to check for
 * @returns true if error is FrameworkError with matching status
 */
export function isFrameworkErrorWithStatus(error: unknown, status: number): boolean {
  return error instanceof FrameworkError && error.status === status;
}

/**
 * Create a standardized error response object for any transport.
 * This is the canonical way to format errors for API responses.
 *
 * @param error - The error to format
 * @returns Standardized error envelope conforming to ErrorEnvelope interface
 */
export function formatErrorResponse(error: unknown): ErrorEnvelope {
  return toErrorEnvelope(error);
}

/**
 * Create an error from a plain object (e.g., from JSON parsing).
 * Used to reconstruct errors from network/serialization.
 *
 * @param obj - The error object to reconstruct
 * @returns A FrameworkError instance if the code is recognized, otherwise the original object
 */
export function reconstructError(obj: Record<string, unknown>): FrameworkError | Record<string, unknown> {
  if (obj.code && typeof obj.code === 'string') {
    const ErrorClass = getErrorClassByCode(obj.code);
    if (ErrorClass) {
      // Reconstruct with the right constructor
      const message = typeof obj.message === 'string' ? obj.message : 'Unknown error';
      const details = typeof obj.details === 'object' && obj.details !== null ? obj.details as Record<string, any> : undefined;
      return new ErrorClass(message, details);
    }
  }
  return obj as Record<string, unknown>;
}

/**
 * Validate that an error response conforms to the ErrorEnvelope shape.
 * Useful for testing and adapter validation.
 *
 * @param error - The error to validate
 * @returns true if the error conforms to ErrorEnvelope
 */
export function isValidErrorEnvelope(error: unknown): error is ErrorEnvelope {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  return (
    typeof e.code === 'string' &&
    typeof e.message === 'string' &&
    (e.status === undefined || typeof e.status === 'number') &&
    (e.details === undefined || typeof e.details === 'object') &&
    (e.stack === undefined || typeof e.stack === 'string')
  );
}
