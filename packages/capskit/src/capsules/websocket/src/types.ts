import { ICapsKit } from '../../../types';

export interface SocketDefinition {
  path: string;
  open?: string;
  message: string;
  close?: string;
  drain?: string;
  schema?: any;
}

export interface WebSocketAdapterOptions {
  [key: string]: any;
}

export type WebSocketAdapter = (capskit: ICapsKit, options: WebSocketAdapterOptions) => Promise<any> | any;
