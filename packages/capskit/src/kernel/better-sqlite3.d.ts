declare module 'better-sqlite3' {
  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): this;
    close(): void;
    [key: string]: any;
  }
  interface Statement {
    run(...params: any[]): any;
    get(...params: any): any;
    all(...params: any): any[];
  }
  function Database(filename: string, options?: any): Database;
  export = Database;
}
