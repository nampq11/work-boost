import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from '@earendil-works/pi-ai';
import { dirname, join } from '@std/path';

type AuthFile = Record<string, unknown>;

const DEFAULT_AUTH_RELATIVE_PATH = '.pi/agent/auth.json';
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 30_000;

export interface FileCredentialStoreOptions {
  path?: string;
}

function getDefaultAuthPath(): string {
  const configuredPath = Deno.env.get('PI_AUTH_PATH')?.trim();
  if (configuredPath) return configuredPath;

  const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE');
  if (!home) throw new Error('Cannot resolve the home directory for pi credentials');
  return join(home, DEFAULT_AUTH_RELATIVE_PATH);
}

function throwIfAborted(options?: AuthOperationOptions): void {
  options?.signal?.throwIfAborted();
}

function asAuthFile(value: unknown): AuthFile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('pi credential file must contain a JSON object');
  }
  return value as AuthFile;
}

function parseCredential(value: unknown): Credential | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const credential = value as Record<string, unknown>;
  if (credential.type === 'api_key') {
    return value as Credential;
  }
  if (
    credential.type === 'oauth' &&
    typeof credential.refresh === 'string' &&
    typeof credential.access === 'string' &&
    typeof credential.expires === 'number'
  ) {
    return value as Credential;
  }
  return undefined;
}

function resolveAuthPath(path: string): string {
  if (!path.startsWith('~')) return path;
  const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE');
  if (!home) throw new Error('Cannot resolve the home directory for pi credentials');
  return join(home, path.slice(2));
}

async function readAuthFile(path: string): Promise<AuthFile> {
  try {
    const contents = await Deno.readTextFile(path);
    return asAuthFile(JSON.parse(contents));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return {};
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in pi credential file: ${path}`, { cause: error });
    }
    throw new Error(`Failed to read pi credential file: ${path}`, { cause: error });
  }
}

async function writeAtomically(path: string, value: AuthFile): Promise<void> {
  const directory = dirname(path);
  await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;

  try {
    await Deno.writeTextFile(temporaryPath, JSON.stringify(value, null, 2) + '\n');
    try {
      await Deno.chmod(temporaryPath, 0o600);
    } catch {
      // chmod is not available on every supported filesystem.
    }
    await Deno.rename(temporaryPath, path);
    try {
      await Deno.chmod(path, 0o600);
    } catch {
      // chmod is not available on every supported filesystem.
    }
  } catch (error) {
    try {
      await Deno.remove(temporaryPath);
    } catch {
      // The temporary file may not have been created.
    }
    throw new Error(`Failed to persist pi credential file: ${path}`, { cause: error });
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * File-backed pi-ai credentials compatible with the flat auth.json format.
 * The lock serializes cross-process refreshes while rename keeps readers from
 * observing a partially written credential file.
 */
export class FileCredentialStore implements CredentialStore {
  readonly path: string;
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(options: FileCredentialStoreOptions = {}) {
    this.path = resolveAuthPath(options.path ?? getDefaultAuthPath());
  }

  private async acquireLock(signal?: AbortSignal): Promise<() => Promise<void>> {
    const lockPath = `${this.path}.lock`;
    const startedAt = Date.now();
    await Deno.mkdir(dirname(this.path), { recursive: true, mode: 0o700 });

    while (true) {
      signal?.throwIfAborted();
      try {
        await Deno.mkdir(lockPath);
        return async () => {
          try {
            await Deno.remove(lockPath);
          } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error;
          }
        };
      } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
        if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
          throw new Error(`Timed out waiting for pi credential lock: ${lockPath}`);
        }
        await delay(LOCK_RETRY_MS);
      }
    }
  }

  private async withFileLock<T>(
    signal: AbortSignal | undefined,
    operation: (file: AuthFile) => Promise<{ result: T; changed?: boolean }>,
  ): Promise<T> {
    const release = await this.acquireLock(signal);
    try {
      const file = await readAuthFile(this.path);
      const { result, changed } = await operation(file);
      if (changed) await writeAtomically(this.path, file);
      return result;
    } finally {
      await release();
    }
  }

  private enqueue<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(providerId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    const tail = current.catch(() => {});
    this.chains.set(providerId, tail);
    void tail.then(() => {
      if (this.chains.get(providerId) === tail) this.chains.delete(providerId);
    });
    return current;
  }

  async read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
    throwIfAborted(options);
    const file = await readAuthFile(this.path);
    return parseCredential(file[providerId]);
  }

  async list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    throwIfAborted(options);
    const file = await readAuthFile(this.path);
    return Object.entries(file).flatMap(([providerId, value]) => {
      const credential = parseCredential(value);
      return credential ? [{ providerId, type: credential.type }] : [];
    });
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    return this.enqueue(providerId, async () =>
      this.withFileLock(options?.signal, async (file) => {
        throwIfAborted(options);
        const current = parseCredential(file[providerId]);
        const next = await fn(current);
        throwIfAborted(options);
        if (next === undefined) return { result: current };
        file[providerId] = next;
        return { result: next, changed: true };
      }),
    );
  }

  async delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
    await this.enqueue(providerId, () =>
      this.withFileLock(options?.signal, async (file) => {
        throwIfAborted(options);
        if (!(providerId in file)) return { result: undefined };
        delete file[providerId];
        return { result: undefined, changed: true };
      }),
    );
  }
}

export function createCredentialStore(path?: string): FileCredentialStore {
  return new FileCredentialStore({ path });
}
