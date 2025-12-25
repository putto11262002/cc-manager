/**
 * Simple logger for CC Run Service
 *
 * Provides structured logging with timestamps and log levels.
 * Uses console.log/error internally, keeping it simple for V1.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default log level from environment (default: info)
const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const parts = [
    `[${formatTimestamp()}]`,
    `[${level.toUpperCase()}]`,
    message,
  ];

  if (context && Object.keys(context).length > 0) {
    parts.push(JSON.stringify(context));
  }

  return parts.join(' ');
}

/**
 * Logger type
 */
interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(baseContext: LogContext): Logger;
}

/**
 * Create a logger with optional base context
 */
function createLogger(baseContext: LogContext = {}): Logger {
  return {
    debug(message: string, context?: LogContext): void {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', message, { ...baseContext, ...context }));
      }
    },

    info(message: string, context?: LogContext): void {
      if (shouldLog('info')) {
        console.log(formatMessage('info', message, { ...baseContext, ...context }));
      }
    },

    warn(message: string, context?: LogContext): void {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', message, { ...baseContext, ...context }));
      }
    },

    error(message: string, context?: LogContext): void {
      if (shouldLog('error')) {
        console.error(formatMessage('error', message, { ...baseContext, ...context }));
      }
    },

    child(childContext: LogContext): Logger {
      return createLogger({ ...baseContext, ...childContext });
    },
  };
}

/**
 * Default logger instance
 */
export const logger: Logger = createLogger();
