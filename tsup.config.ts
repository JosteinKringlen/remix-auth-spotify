import { defineConfig } from 'tsup';

export default defineConfig((opts) => ({
    entry: ['src/index.ts'],
    target: 'es2019',
    sourcemap: true,
    dts: true,
    format: ['esm', 'cjs'],
    clean: !opts.watch,
    platform: 'node',
    outDir: 'build',
}));
