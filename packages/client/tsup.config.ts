import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: true,
    outDir: 'dist',
    target: 'es2022',
  },
  {
    entry: ['src/generators/cli.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    minify: true,
    outDir: 'dist',
    target: 'es2022',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
