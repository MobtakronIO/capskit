export class DrizzleQueryError extends Error {
  constructor(message: string, public query?: string) {
    super(message);
    this.name = 'DrizzleQueryError';
  }
}

export class DrizzleConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrizzleConnectionError';
  }
}
