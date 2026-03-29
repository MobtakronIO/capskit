/**
 * Elysia adapter error mapping utilities.
 * 
 * This module provides Elysia-specific error response formatting while
 * leveraging the canonical error envelope from @mobtakronio/capskit kernel.
 * 
 * Elysia HTTP responses use `error` field (not `message`) for backward compatibility,
 * but the canonical code/status mapping from the kernel is always preserved.
 * 
 * Elysia HTTP Response Format:
 * {
 *   error: string;        // Human-readable message (Elysia convention)
 *   code: string;        // Machine-readable error code (canonical)
 *   status: number;      // HTTP status code
 *   details?: object;    // Additional context (dev only by default)
 *   stack?: string;      // Stack trace (dev only by default)
 * }
 */

import { toErrorEnvelope, shouldExposeStack } from '@mobtakronio/capskit';
import type { FrameworkError } from '@mobtakronio/capskit';

/**
 * Transform canonical ErrorEnvelope to Elysia-compatible HTTP response format.
 * 
 * Canonical: { code, message, status?, details?, stack? }
 * Elysia:   { error, code, status, details?, stack? }
 */
function toElysiaHttpFormat(envelope: { code: string; message: string; status?: number; details?: Record<string, unknown>; stack?: string }): { error: string; code: string; status: number; details?: Record<string, unknown>; stack?: string } {
  return {
    error: envelope.message,
    code: envelope.code,
    status: envelope.status ?? 500,
    ...(envelope.details && Object.keys(envelope.details).length > 0 ? { details: envelope.details } : {}),
    ...(envelope.stack ? { stack: envelope.stack } : {})
  };
}

/**
 * Map an error to an HTTP response.
 * Uses canonical error envelope from kernel and transforms to Elysia format.
 * 
 * @param error - The error to map
 * @param set - Elysia's set object to modify status
 * @returns Elysia-compatible error response with error, code, status, details, stack
 */
export function mapToHttpResponse(error: unknown, set?: any): { error: string; code: string; status: number; details?: Record<string, unknown>; stack?: string } {
  const envelope = toErrorEnvelope(error);
  
  if (set && envelope.status) {
    set.status = envelope.status;
  }
  
  return toElysiaHttpFormat(envelope);
}

/**
 * Handle errors in WebSocket handlers with appropriate responses.
 * Uses canonical error envelope for consistent error reporting.
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
 * Format an error for API responses.
 * Returns canonical error envelope for consistency.
 * 
 * @param error - The error to format
 * @returns Canonical error envelope
 */
export function formatErrorResponse(error: unknown): { error: string; code: string; status: number; details?: Record<string, unknown>; stack?: string } {
  const envelope = toErrorEnvelope(error);
  return toElysiaHttpFormat(envelope);
}

/**
 * Check if an error is a FrameworkError with a specific status code.
 * 
 * @param error - The error to check
 * @param status - The HTTP status code to check for
 * @returns true if error is FrameworkError with matching status
 */
export function isFrameworkErrorWithStatus(error: unknown, status: number): boolean {
  const err = error as any;
  return err?.isFrameworkError === true && err.status === status;
}
