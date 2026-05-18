export interface ClientErrorDetails {
  actionPath?: string;
  statusCode?: number;
  details?: unknown;
  cause?: unknown;
}

export class CapsKitClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: ClientErrorDetails = {},
  ) {
    super(message);
    this.name = 'CapsKitClientError';
  }
}

export class ActionNotFoundError extends CapsKitClientError {
  constructor(actionPath: string, details?: ClientErrorDetails) {
    super('ACTION_NOT_FOUND', `Action "${actionPath}" not found`, {
      actionPath,
      statusCode: 404,
      ...details,
    });
  }
}

export class ActionExecutionError extends CapsKitClientError {
  constructor(actionPath: string, message: string, details?: ClientErrorDetails) {
    super('ACTION_ERROR', `[${actionPath}] ${message}`, {
      actionPath,
      statusCode: 500,
      ...details,
    });
  }
}

export class ValidationError extends CapsKitClientError {
  constructor(message: string, details?: ClientErrorDetails) {
    super('VALIDATION_ERROR', message, {
      statusCode: 422,
      ...details,
    });
  }
}

export class NetworkError extends CapsKitClientError {
  constructor(message: string, details?: ClientErrorDetails) {
    super('NETWORK_ERROR', message, {
      statusCode: 0,
      ...details,
    });
  }
}

export class AuthError extends CapsKitClientError {
  constructor(message: string, details?: ClientErrorDetails) {
    super('AUTH_ERROR', message, {
      statusCode: 401,
      ...details,
    });
  }
}

export class OfflineError extends CapsKitClientError {
  constructor(message: string, details?: ClientErrorDetails) {
    super('OFFLINE_ERROR', message, {
      statusCode: 0,
      ...details,
    });
  }
}

export class SubscriptionError extends CapsKitClientError {
  constructor(message: string, details?: ClientErrorDetails) {
    super('SUBSCRIPTION_ERROR', message, {
      statusCode: 500,
      ...details,
    });
  }
}
