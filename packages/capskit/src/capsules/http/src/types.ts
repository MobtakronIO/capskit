import { ICapsKit } from '../../../types';

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  action: string;
  schema?: any; // Zod schema
  traits?: Record<string, any>;
}

export interface HttpAdapterOptions {
  traitHandlers?: Record<string, Function>;
  [key: string]: any;
}

export type HttpAdapter = (capskit: ICapsKit, options: HttpAdapterOptions) => Promise<any> | any;
