export interface Result<T> {
  ok: boolean;
  value?: T;
  error?: Error;
}

export function Ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function Err<T>(error: Error): Result<T> {
  return { ok: false, error };
}
