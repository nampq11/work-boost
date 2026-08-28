import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from '@earendil-works/pi-ai';
import { dirname, join } from '@std/path';

type AuthFile = Record<string, unknown>;

const DEFAULT_AUTH_RELATIVE_PATH = '.workboost/agent/auth.json';
// Legacy shared pi location; migrated into the work-boost file on first use.
const LEGACY_AUTH_RELATIVE_PATH = '.pi/agent/auth.json';
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_STALE_MS = LOCK_TIMEOUT_MS;

interface LockMetadata {
  pid: number;
  createdAt: number;
}

async function isStaleLock(path: string): Promise<boolean> {
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }

  if (!stat.mtime || Date.now() - stat.mtime.getTime() < LOCK_STALE_MS) return false;

  try {
    const metadata = JSON.parse(await Deno.readTextFile(path)) as Partial<LockMetadata>;
    if (
      typeof metadata.pid !== 'number' ||
      !Number.isInteger(metadata.pid) ||
      typeof metadata.createdAt !== 'number'
    ) {
      return true;
    }

    if (metadata.pid === Deno.pid) return false;
    try {
      Deno.kill(metadata.pid, 0 as unknown as Deno.Signal);
      return false;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return true;
      return false;
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    if (error instanceof SyntaxError) return true;
    throw error;
  }
}

async function chmodIfSupported(path: string): Promise<void> {
  try {
    await Deno.chmod(path, 0o600);
  } catch {
    // chmod is not available on every supported filesystem.
  }
}

export interface FileCredentialStoreOptions {
  path?: string;
}

function resolveHome(): string {
  const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE');
  if (!home) throw new Error('Cannot resolve the home directory for work-boost credentials');
  return home;
}

function getDefaultAuthPath(): string {
  return join(resolveHome(), DEFAULT_AUTH_RELATIVE_PATH);
}

function getLegacyAuthPath(): string {
  return join(resolveHome(), LEGACY_AUTH_RELATIVE_PATH);
}

function pathExists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
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
    if ('key' in credential && typeof credential.key !== 'string') return undefined;
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
    await Deno.writeTextFile(temporaryPath, JSON.stringify(value, null, 2) + '\n', {
      mode: 0o600,
    });
    await chmodIfSupported(temporaryPath);
    await Deno.rename(temporaryPath, path);
    await chmodIfSupported(path);
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
    const configuredPath = options.path?.trim();
    const envPath = Deno.env.get('PI_AUTH_PATH')?.trim();
    this.path = resolveAuthPath(configuredPath || envPath || getDefaultAuthPath());
    // One-time migration from the legacy shared pi location, only when the store
    // is using its default location (no explicit or env-configured path).
    if (!configuredPath && !envPath) this.migrateLegacyIfNeeded();
  }

  /**
   * Copy the legacy shared `~/.pi/agent/auth.json` into the work-boost file the
   * first time the default location is used. Best-effort: if the target already
   * exists (or the legacy file is absent) it is a no-op. A real IO failure is
   * surfaced because the credentials would otherwise appear silently lost.
   */
  private migrateLegacyIfNeeded(): void {
    const legacyPath = resolveAuthPath(getLegacyAuthPath());
    if (legacyPath === this.path) return;
    if (pathExists(this.path)) return;
    if (!pathExists(legacyPath)) return;
    try {
      const contents = Deno.readTextFileSync(legacyPath);
      Deno.mkdirSync(dirname(this.path), { recursive: true });
      Deno.writeTextFileSync(this.path, contents, { mode: 0o600 });
    } catch (error) {
      throw new Error(
        `Failed to migrate work-boost credentials from ${legacyPath} to ${this.path}`,
        { cause: error },
      );
    }
  }

  private async acquireLock(signal?: AbortSignal): Promise<() => Promise<void>> {
    const lockPath = `${this.path}.lock`;
    const startedAt = Date.now();
    await Deno.mkdir(dirname(this.path), { recursive: true, mode: 0o700 });

    while (true) {
      signal?.throwIfAborted();
      try {
        const lock = await Deno.open(lockPath, { createNew: true, write: true, mode: 0o600 });
        try {
          const metadata: LockMetadata = { pid: Deno.pid, createdAt: Date.now() };
          await lock.write(new TextEncoder().encode(JSON.stringify(metadata)));
        } finally {
          lock.close();
        }
        return async () => {
          try {
            await Deno.remove(lockPath);
          } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error;
          }
        };
      } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
        if (await isStaleLock(lockPath)) {
          try {
            await Deno.remove(lockPath);
            continue;
          } catch (removeError) {
            if (!(removeError instanceof Deno.errors.NotFound)) throw removeError;
            continue;
          }
        }
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
