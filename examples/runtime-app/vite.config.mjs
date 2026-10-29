import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@open-view/runtime': fileURLToPath(new URL(command === 'serve' ? './src/tracing.mjs' : './src/tracing-disabled.mjs', import.meta.url)) } },
  server: { host: '127.0.0.1', strictPort: true },
  build: { outDir: '../../artifacts/runtime-production', emptyOutDir: true, sourcemap: false },
}));
