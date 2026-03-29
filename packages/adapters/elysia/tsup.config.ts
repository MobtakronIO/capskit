import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'http/index': 'src/http/index.ts',
    'websocket/index': 'src/websocket/index.ts',
    'shared/index': 'src/shared/index.ts'
  },
  format: ['cjs', 'esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  outDir: 'dist',
  target: 'node20',
  external: ['elysia', '@mobtakronio/capskit']
});
