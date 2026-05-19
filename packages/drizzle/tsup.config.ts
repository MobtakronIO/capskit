import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  outDir: 'dist',
  target: 'node20',
  external: ['@mobtakronio/capskit', 'drizzle-orm', 'better-sqlite3', 'pg', 'drizzle-orm/better-sqlite3', 'drizzle-orm/node-postgres', 'drizzle-orm/bun-sqlite', 'bun:sqlite']
});
