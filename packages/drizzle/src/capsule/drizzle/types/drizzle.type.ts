export interface DrizzleQueryInput {
  table: string;
  operation: 'select' | 'count';
  where?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
}

export interface DrizzleExecuteInput {
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data?: Record<string, unknown>;
  where?: Record<string, unknown>;
}

export interface DrizzleTransactionInput {
  operations: {
    table: string;
    operation: string;
    data?: Record<string, unknown>;
    where?: Record<string, unknown>;
  }[];
}
