export interface SocketDefinition {
  path: string;
  open?: string;
  message: string;
  close?: string;
  drain?: string;
  schema?: any;
}
