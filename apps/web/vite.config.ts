import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createLogger, defineConfig } from 'vite';

const defaultLogger = createLogger();
const logger = {
  ...defaultLogger,
  error(message: string, options?: Parameters<typeof defaultLogger.error>[1]) {
    if (message.includes('http proxy error') && message.includes('AbortError')) return;
    defaultLogger.error(message, options);
  },
};

export default defineConfig({
  customLogger: logger,
  resolve: {
    // vite does not read deno.json import maps, so workspace packages need explicit aliases
    alias: {
      // must precede the '@work-boost/shared' entry: string aliases also match subpaths
      '@work-boost/shared/workspace-path.ts': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/shared/src/workspace-path.ts',
      ),
      '@work-boost/shared/trash-record.ts': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/shared/src/trash-record.ts',
      ),
      '@work-boost/shared': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/shared/mod.ts',
      ),
      // must precede the '@work-boost/ui' entry: string aliases also match subpaths
      '@work-boost/ui/styles/tokens.css': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/ui/src/styles/tokens.css',
      ),
      '@work-boost/ui': path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../packages/ui/mod.ts',
      ),
    },
  },
  plugins: [react(), tailwindcss()],
  server: {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:3001', 'null'],
    },
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
      '/workspace-apps': 'http://localhost:3001',
    },
  },
});
