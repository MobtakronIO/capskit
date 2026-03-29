import type { FrameworkError } from '@mobtakronio/capskit';

export function mapToHttpResponse(error: unknown, set?: any): { error: string; details?: Record<string, any>; stack?: string } {
  const err = error as any;
  
  if (err?.isFrameworkError && err.status) {
    if (set) {
      set.status = err.status;
    }
    return {
      error: err.message,
      ...(err.details && { details: err.details }),
      ...(process.env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {})
    };
  }

  if (set) {
    set.status = 500;
  }
  return {
    error: err?.message ?? 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && err?.stack ? { stack: err?.stack } : {})
  };
}

export function handleWebSocketError(error: unknown, ws: any, handlerType: 'open' | 'message' | 'close' | 'drain'): void {
  const err = error as any;
  
  if (err?.isFrameworkError) {
    const errorMsg = JSON.stringify({
      error: err.message,
      ...(err.details && { details: err.details })
    });

    switch (handlerType) {
      case 'open':
        ws.close(1011, err.message);
        break;
      case 'message':
        ws.send(errorMsg);
        break;
      case 'close':
      case 'drain':
        console.error(`[WebSocket] Error in ${handlerType} handler:`, err.message);
        break;
    }
  } else {
    const errorMsg = process.env.NODE_ENV === 'development'
      ? JSON.stringify({ error: err?.message ?? 'Internal server error', stack: err?.stack })
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
        console.error(`[WebSocket] Error in ${handlerType} handler:`, err?.message);
        break;
    }
  }
}

export function formatErrorResponse(error: unknown): { error: string; code: string; status?: number; details?: Record<string, any>; stack?: string } {
  const err = error as any;
  
  if (err?.isFrameworkError) {
    return {
      error: err.message,
      code: err.code,
      status: err.status,
      details: err.details,
      ...(process.env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {})
    };
  }

  return {
    error: process.env.NODE_ENV === 'development' ? (err?.message ?? 'Internal server error') : 'Internal server error',
    code: 'UNKNOWN_ERROR',
    status: 500,
    ...(process.env.NODE_ENV === 'development' && err?.stack ? { stack: err.stack } : {})
  };
}

export function isFrameworkErrorWithStatus(error: unknown, status: number): boolean {
  const err = error as any;
  return err?.isFrameworkError && err.status === status;
}
