#!/usr/bin/env node

// Fix EventTarge memory leak by setting max listeners early
import { EventEmitter } from 'node:events';
EventEmitter.defaultMaxListeners = 20;

// Increase AbortSignal max listeners to prevent memory leaks warnings
if (typeof globalThis !== 'undefined' && globalThis.EventTarget) {
  const originalAddEventListener = globalThis.EventTarget.prototype.addEventListener;
  const listenerCounts = new WeakMap();

  globalThis.EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === 'abort' && this.constructor.name === 'AbortSignal') {
      const currentCount = listenerCounts.get(this) || 0;
      if (currentCount >= 15) {
        console.warn(`AbortSignal has ${currentCount} listeners, potential memory leak`);
      }
      listenerCounts.set(this, currentCount + 1);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
}

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../core/env.ts';
import { logger } from '../core/logger/logger.ts';
import { ApiServer } from './api/server.ts';

// Helper function to resolve .env file path
function resolveEnvPath(): string {
  // Try current working directory first
  if (existsSync('.env')) {
    return '.env';
  }

  // Try relative to project root (where package.jso is located)
  const currentFileUrl = import.meta.url;
  const currentFilePath = fileURLToPath(currentFileUrl);
  const projectRoot = path.resolve(path.dirname(currentFilePath), '../..');
  const envPath = path.resolve(projectRoot, '.env');

  return envPath;
}

async function startApiMode(options: any): Promise<void> {
  const port = parseInt(options.port) || 3001;
  const host = options.host || 'localhost';
  const apiPrefix =
    process.env.WORKBOOST_API_PREFIX !== undefined
      ? process.env.WORKBOOST_API_PREFIX === '""'
        ? ''
        : process.env.WORKBOOST_API_PREFIX
      : options.apiPrefix;

  logger.info(`Starting API server on http://${host}:${port}${apiPrefix}`, undefined, 'green');

  const apiServer = new ApiServer({
    port,
    host,
    corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
    rateLimitMaxRequests: 100,
    rateLimitWindowMs: 15 * 60 * 1000,
    enableWebSocket: false,
    apiPrefix,
  });

  try {
    await apiServer.start();
    logger.info(`API server is running and ready to accept requests`, undefined, 'green');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    process.exit(1);
  }
}

startApiMode({
  port: 3001,
  host: 'localhost',
  apiPrefix: '/api',
}).catch((error) => {
  const errorMsg = error instanceof Error ? error.message : String(error);
  logger.error('Failed to start API server:', { error: errorMsg });
  process.exit(1);
});
