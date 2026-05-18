import { BuildRouterResult } from './compiled-route.type';

export interface ServerOptions {
  port?: number;
  hostname?: string;
  cors?: boolean;
  prefix?: string;
}

export interface Server {
  port: number;
  url: string;
  stop: () => Promise<void>;
}

export interface HttpAdapter {
  name: string;    // 'elysia' | 'express' | 'hono'
  version: string;
  createServer(routes: BuildRouterResult, options: ServerOptions): Promise<Server>;
}
