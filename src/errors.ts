/**
 * Custom error types for CC Run Service
 *
 * These errors provide structured error handling with consistent codes and messages.
 */

/**
 * Base error class for all service errors
 */
export class ServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

/**
 * Session not found error
 */
export class SessionNotFoundError extends ServiceError {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' not found`, 'SESSION_NOT_FOUND', 404);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Run not found error
 */
export class RunNotFoundError extends ServiceError {
  constructor(runId: string) {
    super(`Run '${runId}' not found`, 'RUN_NOT_FOUND', 404);
    this.name = 'RunNotFoundError';
  }
}

/**
 * Run already completed error (cannot cancel)
 */
export class RunAlreadyCompletedError extends ServiceError {
  constructor(runId: string) {
    super(`Run '${runId}' has already completed and cannot be cancelled`, 'RUN_ALREADY_COMPLETED', 400);
    this.name = 'RunAlreadyCompletedError';
  }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends ServiceError {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.field = field;
  }

  override toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.field && { field: this.field }),
      },
    };
  }
}

/**
 * SDK execution error
 */
export class ExecutionError extends ServiceError {
  constructor(message: string) {
    super(message, 'EXECUTION_ERROR', 500);
    this.name = 'ExecutionError';
  }
}

/**
 * Run cancelled error
 */
export class RunCancelledError extends ServiceError {
  constructor(runId: string) {
    super(`Run '${runId}' was cancelled`, 'RUN_CANCELLED', 499);
    this.name = 'RunCancelledError';
  }
}

/**
 * Check if error is a ServiceError
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Wrap unknown error in ServiceError
 */
export function wrapError(error: unknown): ServiceError {
  if (isServiceError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ExecutionError(message);
}
