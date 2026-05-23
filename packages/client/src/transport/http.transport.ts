import {
  ActionNotFoundError,
  ActionExecutionError,
  NetworkError,
  AuthError,
  CapsKitClientError,
} from '../errors/client-errors.error';
import type { CallOptions, AuthConfig, RetryConfig, DescribeResult, EmitResult } from '../types/client.type';
import type { CapsuleManifest } from '@mobtakronio/capskit';

interface HttpTransportConfig {
  baseUrl: string;
  auth?: AuthConfig;
  retry?: RetryConfig;
}

interface Envelope<T = unknown> {
  ok: boolean;
  result?: T;
  error?: string;
  durationMs?: number;
}

export class HttpTransport {
  private baseUrl: string;
  private auth?: AuthConfig;
  private retry: Required<RetryConfig>;

  constructor(config: HttpTransportConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.auth = config.auth;
    this.retry = {
      maxRetries: config.retry?.maxRetries ?? 0,
      backoff: config.retry?.backoff ?? 'none',
      retryOn: config.retry?.retryOn ?? [],
    };
  }

  async call<T = unknown>(actionPath: string, payload?: unknown, options?: CallOptions): Promise<T> {
    const url = `${this.baseUrl}/api/call`;
    const body = { actionPath, payload };

    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    const envelope = (await response.json()) as Envelope<T>;

    if (!envelope.ok) {
      throw new ActionExecutionError(actionPath, envelope.error ?? 'Unknown error', {
        statusCode: response.status,
        details: envelope,
      });
    }

    return envelope.result as T;
  }

  async rpc(method: 'call' | 'emit', params: Record<string, unknown>): Promise<Envelope> {
    const url = `${this.baseUrl}/api/capskit/rpc`;
    const body = { method, ...params };

    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const envelope = (await response.json()) as Envelope;

    if (!envelope.ok && method === 'call') {
      const actionPath = (params.actionPath as string) ?? 'unknown';
      throw new ActionExecutionError(actionPath, envelope.error ?? 'Unknown error', {
        statusCode: response.status,
        details: envelope,
      });
    }

    return envelope;
  }

  async emit(event: string, data: unknown): Promise<EmitResult> {
    const envelope = await this.rpc('emit', { event, data });
    return (envelope.result as EmitResult) ?? { emitted: true, event };
  }

  async describe(): Promise<DescribeResult> {
    const url = `${this.baseUrl}/api/capskit/describe`;

    const response = await this.fetchWithAuth(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const envelope = (await response.json()) as Envelope<{
      capsules: CapsuleManifest[];
    }>;

    if (!envelope.ok || !envelope.result) {
      throw new NetworkError('Describe endpoint returned error', {
        details: envelope.error,
      });
    }

    const capsules = envelope.result.capsules;
    return {
      capsules,
      capsuleCount: capsules.length,
      capCount: capsules.reduce((sum, c) => sum + (Array.isArray(c.caps) ? c.caps.length : 0), 0),
    };
  }

  private async fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
    let attempts = 0;
    const maxAttempts = 1 + this.retry.maxRetries;

    while (attempts < maxAttempts) {
      const headers = new Headers(init.headers as Record<string, string> | undefined);

      if (this.auth) {
        const token = await this.auth.token();
        headers.set('Authorization', `Bearer ${token}`);
      }

      try {
        const response = await fetch(url, { ...init, headers });

        if (response.status === 401 && this.auth?.refresh && attempts === 0) {
          await this.auth.refresh();
          attempts++;
          continue;
        }

        if (this.retry.retryOn.includes(response.status) && attempts < maxAttempts - 1) {
          const delay = this.getRetryDelay(attempts);
          await this.sleep(delay);
          attempts++;
          continue;
        }

        if (!response.ok) {
          throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`, {
            statusCode: response.status,
          });
        }

        return response;
      } catch (err) {
        if (err instanceof CapsKitClientError) throw err;

        if (attempts < maxAttempts - 1) {
          const delay = this.getRetryDelay(attempts);
          await this.sleep(delay);
          attempts++;
          continue;
        }

        throw new NetworkError(err instanceof Error ? err.message : String(err), {
          cause: err,
        });
      }
    }

    throw new NetworkError('Max retry attempts exceeded');
  }

  private getRetryDelay(attempt: number): number {
    switch (this.retry.backoff) {
      case 'exponential':
        return Math.min(1000 * 2 ** attempt, 30000);
      case 'linear':
        return 1000 * (attempt + 1);
      default:
        return 0;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
