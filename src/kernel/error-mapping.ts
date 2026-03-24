/**
 * Centralized error mapping utilities for CapsKit adapters.
 * Provides consistent error handling patterns across HTTP, WebSocket, and other transports.
 */

import { FrameworkError } from './errors';

/**
 * Map a FrameworkError to an appropriate HTTP response.
 * Returns a response object with error details and appropriate status.
 *
 * @param error - The error to map
 * @param set - Elysia's set object to modify status (optional, can be undefined for generic mapping)
 * @returns Object with error message and optional details/stack
 */
export function mapToHttpResponse(error: any, set?: any): { error: string; details?: Record<string, any>; stack?: string } {
  if (error instanceof FrameworkError && error.status) {
    if (set) {
      set.status = error.status;
    }
    return {
      error: error.message,
      ...(error.details && { details: error.details }),
      ...(process.env.NODE_ENV === 'development' && error.stack ? { stack: error.stack } : {})
    };
  }

  // Unexpected errors - 500
  if (set) {
    set.status = 500;
  }
  return {
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && error.stack ? { stack: error.stack } : {})
  };
}

/**
 * Handle errors in WebSocket handlers with appropriate responses.
 *
 * @param error - The error to handle
 * @param ws - The WebSocket connection
 * @param handlerType - Type of handler ('open'|'message'|'close'|'drain')
 */
export function handleWebSocketError(error: any, ws: any, handlerType: 'open' | 'message' | 'close' | 'drain'): void {
  if (error instanceof FrameworkError) {
    // For WebSocket, send structured error if possible, or close connection
    const errorMsg = JSON.stringify({
      error: error.message,
      ...(error.details && { details: error.details })
    });

    switch (handlerType) {
      case 'open':
        // Can't send message on open failure, close connection with error code
        ws.close(1011, error.message);
        break;
      case 'message':
        ws.send(errorMsg);
        break;
      case 'close':
      case 'drain':
        // Log but don't attempt to send on closing/drain
        console.error(`[WebSocket] Error in ${handlerType} handler:`, error.message);
        break;
    }
  } else {
    // Unexpected errors
    const errorMsg = process.env.NODE_ENV === 'development'
      ? JSON.stringify({ error: error.message, stack: error.stack })
      : JSON.stringify({ error: 'Internal server error' });

    switch (handlerType) {
      case 'open':
        ws.close(1011, 'Internal server error');
        break;
      case 'message':
        ws.send(errorMsg);
        break;
      case 'close':
      case 'drain':
        console.error(`[WebSocket] Error in ${handlerType} handler:`, error.message);
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
export function isFrameworkErrorWithStatus(error: any, status: number): boolean {
  return error instanceof FrameworkError && error.status === status;
}

/**
 * Create a standardized error response object for any transport.
 *
 * @param error - The error to format
 * @returns Standardized error response
 */
export function formatErrorResponse(error: any): { error: string; code: string; status?: number; details?: Record<string, any>; stack?: string } {
  if (error instanceof FrameworkError) {
    return {
      error: error.message,
      code: error.code,
      status: error.status,
      details: error.details,
      ...(process.env.NODE_ENV === 'development' && error.stack ? { stack: error.stack } : {})
    };
  }

  return {
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    code: 'UNKNOWN_ERROR',
    status: 500,
    ...(process.env.NODE_ENV === 'development' && error.stack ? { stack: error.stack } : {})
  };
}
