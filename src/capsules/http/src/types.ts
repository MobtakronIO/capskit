export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  action: string;
  schema?: any; // Zod schema
  traits?: Record<string, any>;
}
