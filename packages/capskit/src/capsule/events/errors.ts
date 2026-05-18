import { FrameworkError } from '../kernel/errors';

export class EventDeliveryError extends FrameworkError {
  public event: string;
  public capPath: string;
  constructor(message: string, event: string, capPath: string) {
    super(message, 'EVENT_DELIVERY_ERROR', 500);
    this.name = 'EventDeliveryError';
    this.event = event;
    this.capPath = capPath;
  }
}

export class DeadLetterError extends FrameworkError {
  public event: string;
  public capPath: string;
  public originalError: string;
  constructor(event: string, capPath: string, originalError: string) {
    super(`Dead letter: ${event} → ${capPath}: ${originalError}`, 'DEAD_LETTER_ERROR', 500);
    this.name = 'DeadLetterError';
    this.event = event;
    this.capPath = capPath;
    this.originalError = originalError;
  }
}
