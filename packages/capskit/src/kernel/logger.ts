/**
 * Lightweight logging abstraction for CapsKit kernel.
 * Provides structured logging with configurable log levels.
 * Replaces direct console.* calls throughout the kernel.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Logger interface for CapsKit kernel modules.
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Get the current log level from environment.
 * Defaults to 'info' in development, 'warn' in production.
 */
export function getLogLevel(): LogLevel {
  const envLevel = process.env.CAPSKIT_LOG_LEVEL;
  if (envLevel && ['debug', 'info', 'warn', 'error', 'silent'].includes(envLevel)) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'warn' : 'info';
}

const LOG_LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

function shouldLog(level: LogLevel): boolean {
  const current = getLogLevel();
  return LOG_LEVEL_ORDER.indexOf(level) >= LOG_LEVEL_ORDER.indexOf(current);
}

function formatMessage(module: string, message: string): string {
  return `[${module}] ${message}`;
}

/**
 * Create a logger for a specific module.
 * Prefixes all messages with the module name.
 */
export function createLogger(module: string): Logger {
  return {
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog('debug')) {
        console.debug(formatMessage(module, message), ...args);
      }
    },
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) {
        console.info(formatMessage(module, message), ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn(formatMessage(module, message), ...args);
      }
    },
    error: (message: string, ...args: unknown[]) => {
      if (shouldLog('error')) {
        console.error(formatMessage(module, message), ...args);
      }
    },
  };
}

/**
 * Default kernel logger.
 */
export const kernelLogger = createLogger('CapsKit');
