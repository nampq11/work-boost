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
