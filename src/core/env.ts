import process from 'node:process';
import { load } from '@std/dotenv';
import { z } from 'zod';

const isMcpMode =
  Deno.args.includes('--mode') && Deno.args[Deno.args.indexOf('--mode') + 1] === 'mcp';
const envFile = await load();

if (isMcpMode) {
  for (const [key, value] of Object.entries(envFile)) {
    if (Deno.env.get(key) === undefined) {
      Deno.env.set(key, value);
    }
  }
} else {
  for (const [key, value] of Object.entries(envFile)) {
    Deno.env.set(key, value);
  }
}

const envSchema = z.object({
  DENO_ENV: z.enum(['developement', 'production', 'test']).default('developement'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  REDACT_SECRETS: z.boolean().default(true),
});

type EnvSchema = z.infer<typeof envSchema>;

/**
 * Get environment variable by key
 * This function works correctly with TypeScript and Deno
 */
function getEnvValue(key: string): string | undefined {
  return Deno.env.get(key);
}

/**
 * Environment object that supports both property access and function call syntax
 * - env.GOOGLE_API_KEY (property access)
 * - env.get('GOOGLE_API_KEY') (function call)
 */
const envHandlers = {
  get(key: string): string | undefined {
    return getEnvValue(key);
  },
};

const envProxy = new Proxy(envHandlers, {
  get(_target, prop: string | symbol): any {
    if (prop === 'get' && typeof prop === 'string') {
      return envHandlers.get;
    }
    if (typeof prop !== 'string') {
      return undefined;
    }
    // Handle property access like env.GOOGLE_API_KEY
    switch (prop) {
      case 'DENO_ENV':
        return Deno.env.get('DENO_ENV') || 'developement';
      case 'LOG_LEVEL':
        return Deno.env.get('LOG_LEVEL') || 'info';
      case 'REDACT_SECRETS':
        const redactValue = Deno.env.get('REDACT_SECRETS');
        return redactValue === undefined ? true : redactValue === 'false';
      default:
        return Deno.env.get(prop);
    }
  },
});

export const env = envProxy as EnvSchema & { get(key: string): string | undefined };

export const validateEnv = () => {
  const envToValidate = {
    DENO_ENV: Deno.env.get('DENO_ENV'),
    LOG_LEVEL: Deno.env.get('LOG_LEVEL'),
    REDACT_SECRETS: Deno.env.get('REDACT_SECRETS') === 'false' ? false : true,
  };

  const result = envSchema.safeParse(envToValidate);
  if (!result.success) {
    // Note: logger might not be available during early initialization
    const errorMsg = `Environment validation failed: ${JSON.stringify(result.error.issues)}`;
    if (isMcpMode) {
      process.stderr.write(`[MCP-SERVER] ERROR: ${errorMsg}\n`);
    } else {
      console.error('Environment validation failed:', result.error.issues);
    }
    return false;
  }
  return result.success;
};
