import type { ClientInterceptor, InterceptorContext } from '../types/client.type';
import { CapsKitClientError, ActionExecutionError } from '../errors/client-errors.error';

// ── Logging Interceptor ────────────────────────────────────────────────

export interface LoggingInterceptorOptions {
  logger?: (msg: string) => void;
  level?: 'info' | 'debug' | 'warn';
}

/**
 * Logs action calls with duration.
 * Outputs: `[CapsKit] invoicing.create — 42ms`
 */
export function loggingInterceptor(
  options: LoggingInterceptorOptions = {},
): ClientInterceptor {
  const log = options.logger ?? console.log;

  return {
    name: 'logging',
    before: (ctx: InterceptorContext) => {
      if (options.level === 'debug') {
        log(`[CapsKit] → ${ctx.actionPath}`, ctx.payload);
      }
      return ctx;
    },
    after: (ctx: InterceptorContext) => {
      const status = ctx.error ? '✗' : '✓';
      const duration = ctx.durationMs ?? 0;
      log(`[CapsKit] ${status} ${ctx.actionPath} — ${duration}ms`);
      if (ctx.error && options.level === 'debug') {
        log(`[CapsKit] error:`, ctx.error);
      }
      return ctx;
    },
  };
}

// ── Auth Interceptor ───────────────────────────────────────────────────

export interface AuthInterceptorOptions {
  getToken: () => string | Promise<string>;
  headerName?: string;
  headerPrefix?: string;
}

/**
 * Injects an auth token into the payload's _headers field.
 * Assumes the backend reads `_headers` from the call payload.
 */
export function authInterceptor(options: AuthInterceptorOptions): ClientInterceptor {
  const headerName = options.headerName ?? 'Authorization';
  const prefix = options.headerPrefix ?? 'Bearer ';

  return {
    name: 'auth',
    before: async (ctx: InterceptorContext) => {
      const token = await options.getToken();
      const payload = ctx.payload as Record<string, unknown> | null;

      if (payload && typeof payload === 'object') {
        const existingHeaders = (payload._headers as Record<string, string>) ?? {};
        payload._headers = {
          ...existingHeaders,
          [headerName]: `${prefix}${token}`,
        };
      }

      return ctx;
    },
  };
}

// ── Error Normalization Interceptor ────────────────────────────────────

/**
 * Normalizes raw error responses into CapsKitClientError instances.
 */
export function errorNormalizationInterceptor(): ClientInterceptor {
  return {
    name: 'error-normalization',
    after: (ctx: InterceptorContext) => {
      if (!ctx.error) return ctx;

      // Already a CapsKitClientError — leave it
      if (ctx.error instanceof CapsKitClientError) return ctx;

      // Normalize plain errors
      if (ctx.error instanceof Error) {
        ctx.error = new ActionExecutionError(
          ctx.actionPath,
          ctx.error.message,
          { cause: ctx.error },
        );
      } else if (typeof ctx.error === 'string') {
        ctx.error = new ActionExecutionError(ctx.actionPath, ctx.error);
      } else if (ctx.error && typeof ctx.error === 'object') {
        const errObj = ctx.error as Record<string, unknown>;
        const message = (errObj.message as string) ?? JSON.stringify(ctx.error);
        const code = (errObj.code as string) ?? 'UNKNOWN_ERROR';
        ctx.error = new CapsKitClientError(code, message, {
          actionPath: ctx.actionPath,
          details: ctx.error,
        });
      }

      return ctx;
    },
  };
}

// ── Retry Interceptor ──────────────────────────────────────────────────

export interface RetryInterceptorOptions {
  maxRetries?: number;
  backoff?: 'linear' | 'exponential' | 'none';
  retryOn?: number[]; // HTTP status codes to retry on (extracted from error)
}

/**
 * Retries failed calls with configurable backoff strategy.
 * Only retries when the error has a statusCode matching retryOn.
 */
export function retryInterceptor(
  options: RetryInterceptorOptions = {},
): ClientInterceptor {
  const maxRetries = options.maxRetries ?? 3;
  const backoff = options.backoff ?? 'exponential';
  const retryOn = options.retryOn ?? [429, 500, 502, 503, 504];

  return {
    name: 'retry',
    after: async (ctx: InterceptorContext) => {
      if (!ctx.error) return ctx;

      const statusCode = extractStatusCode(ctx.error);
      if (!retryOn.includes(statusCode)) return ctx;

      // Check if we've already retried (metadata tracks attempt count)
      const attempts = (ctx.metadata.__retryAttempts as number) ?? 0;
      if (attempts >= maxRetries) return ctx;

      const delay = getRetryDelay(attempts, backoff);
      ctx.metadata.__retryAttempts = attempts + 1;

      await sleep(delay);

      // Clear error so the pipeline re-executes
      ctx.error = undefined;
      ctx.result = undefined;

      return ctx;
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function extractStatusCode(error: unknown): number {
  if (error instanceof CapsKitClientError) {
    return error.details?.statusCode ?? 0;
  }
  if (error instanceof Error) {
    const withStatus = error as Error & { statusCode?: number };
    return withStatus.statusCode ?? 0;
  }
  if (error && typeof error === 'object') {
    return ((error as Record<string, unknown>).statusCode as number) ?? 0;
  }
  return 0;
}

function getRetryDelay(attempt: number, backoff: 'linear' | 'exponential' | 'none'): number {
  switch (backoff) {
    case 'exponential':
      return Math.min(1000 * 2 ** attempt, 30000);
    case 'linear':
      return 1000 * (attempt + 1);
    default:
      return 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
