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
  InternalError,
} from './errors';

export const ERROR_STATUS_MAP: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND_ERROR: 404,
  TIMEOUT_ERROR: 408,
  UNAUTHORIZED_ERROR: 401,
  FORBIDDEN_ERROR: 403,
  DEPENDENCY_ERROR: 500,
  INTERNAL_ERROR: 500,
  UNKNOWN_ERROR: 500,
} as const;

export const FRAMEWORK_ERRORS = {
  ValidationError,
  NotFoundError,
  TimeoutError,
  DependencyError,
  UnauthorizedError,
  AuthorizationError,
  InternalError,
} as const;

export type FrameworkErrorConstructor = new (message: string, details?: Record<string, unknown>) => FrameworkError;

export const ERROR_CODE_TO_CLASS: Record<string, FrameworkErrorConstructor> = {
  VALIDATION_ERROR: ValidationError,
  NOT_FOUND_ERROR: NotFoundError,
  TIMEOUT_ERROR: TimeoutError,
  DEPENDENCY_ERROR: DependencyError,
  UNAUTHORIZED_ERROR: UnauthorizedError,
  FORBIDDEN_ERROR: AuthorizationError,
  INTERNAL_ERROR: InternalError,
} as const;

export function getErrorClassByCode(code: string): FrameworkErrorConstructor | undefined {
  return ERROR_CODE_TO_CLASS[code] ?? undefined;
}

export function getHttpStatus(error: FrameworkError | { code: string; status?: number }): number {
  if (error instanceof FrameworkError && error.status) {
    return error.status;
  }
  return ERROR_STATUS_MAP[error.code] ?? 500;
}

export function mapToHttpResponse(error: unknown, set?: { status?: number }): ErrorEnvelope {
  const envelope = toErrorEnvelope(error);
  if (set && envelope.status) {
    set.status = envelope.status;
  }
  return envelope;
}

export function handleWebSocketError(error: unknown, ws: { close: (code: number, reason: string) => void; send: (data: string) => void }, handlerType: 'open' | 'message' | 'close' | 'drain'): void {
  const envelope = toErrorEnvelope(error);
  const errorJson = JSON.stringify(envelope);

  if ((error as any)?.isFrameworkError === true && envelope.status) {
    switch (handlerType) {
      case 'open': ws.close(1011, envelope.message); break;
      case 'message': ws.send(errorJson); break;
      case 'close':
      case 'drain': console.error(`[WebSocket] Error in ${handlerType} handler:`, envelope.message); break;
    }
  } else {
    switch (handlerType) {
      case 'open': ws.close(1011, process.env.NODE_ENV === 'production' ? 'Internal server error' : envelope.message); break;
      case 'message': ws.send(errorJson); break;
      case 'close':
      case 'drain': console.error(`[WebSocket] Error in ${handlerType} handler:`, envelope.message); break;
    }
  }
}

export function isFrameworkErrorWithStatus(error: unknown, status: number): boolean {
  return error instanceof FrameworkError && error.status === status;
}

export function formatErrorResponse(error: unknown): ErrorEnvelope {
  return toErrorEnvelope(error);
}

export function reconstructError(obj: Record<string, unknown>): FrameworkError | Record<string, unknown> {
  if (obj.code && typeof obj.code === 'string') {
    const ErrorClass = getErrorClassByCode(obj.code);
    if (ErrorClass) {
      const message = typeof obj.message === 'string' ? obj.message : 'Unknown error';
      const details = typeof obj.details === 'object' && obj.details !== null ? obj.details as Record<string, unknown> : undefined;
      return new ErrorClass(message, details);
    }
  }
  return obj as Record<string, unknown>;
}

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

// Re-export core types for adapter convenience
export { FrameworkError, ErrorEnvelope, toErrorEnvelope, shouldExposeStack };
