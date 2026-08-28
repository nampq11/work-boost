/// <reference lib="deno.ns" />

import process from 'node:process';
import { load } from '@std/dotenv';
import { z } from 'zod';

const isMcpMode =
  Deno.args.includes('--mode') && Deno.args[Deno.args.indexOf('--mode') + 1] === 'mcp';

// Load .env file if it exists (skip in production where env vars are already set)
let envFile: Record<string, string> = {};
try {
  envFile = await load();
} catch {
  // .env file doesn't exist or can't be read - that's OK in production
}

// Process environment always wins over .env file values (matches MCP mode behavior).
for (const [key, value] of Object.entries(envFile)) {
  if (Deno.env.get(key) === undefined) {
    Deno.env.set(key, value);
  }
}

const envSchema = z.object({
  DENO_ENV: z
    .enum(['development', 'developement', 'production', 'test'])
    .default('development')
    // 'developement' is accepted for backward compatibility but normalized to 'development'
    .transform((value): 'development' | 'production' | 'test' =>
      value === 'developement' ? 'development' : value,
    ),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  REDACT_SECRETS: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
});

export type EnvSchema = z.infer<typeof envSchema>;

export interface Env extends EnvSchema {
  /** Read a variable outside the validated schema (secrets, feature tokens). */
  get(key: string): string | undefined;
}

/**
 * Validate and parse the controlled environment variables. Invalid values fall
 * back to the schema defaults so the app still boots, with the parse errors
 * reported for diagnosis.
 */
export function parseEnv(source: Record<string, string | undefined>): EnvSchema {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const message = `Environment validation failed: ${JSON.stringify(result.error.issues)}; using defaults`;
    if (isMcpMode) {
      process.stderr.write(`[MCP-SERVER] ERROR: ${message}\n`);
    } else {
      console.error(message);
    }
    return envSchema.parse({});
  }
  return result.data;
}

export const env: Env = {
  ...parseEnv({
    DENO_ENV: Deno.env.get('DENO_ENV'),
    LOG_LEVEL: Deno.env.get('LOG_LEVEL'),
    REDACT_SECRETS: Deno.env.get('REDACT_SECRETS'),
  }),
  get(key: string): string | undefined {
    return Deno.env.get(key);
  },
};
