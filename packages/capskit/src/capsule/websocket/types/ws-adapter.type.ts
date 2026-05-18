import { BuildWSResult } from './compiled-endpoint.type';

export interface WsServerOptions {
  port?: number;
  hostname?: string;
  path?: string;
}

export interface WsServer {
  port: number;
  url: string;
  stop: () => Promise<void>;
}

export interface WsAdapter {
  name: string;    // 'socketio' | 'ws' | etc.
  version: string;
  createServer(endpoints: BuildWSResult, options: WsServerOptions): Promise<WsServer>;
}
