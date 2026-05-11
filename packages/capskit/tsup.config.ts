import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/lint/no-direct-call.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  outDir: 'dist',
  target: 'node20',
  shims: true,
  external: ['elysia']
});

