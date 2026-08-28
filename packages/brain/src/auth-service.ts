import type { AuthEvent, AuthType, Models } from '@earendil-works/pi-ai';
import type {
  AIProviderDescriptor,
  AuthLoginEvent,
  AuthLoginSession,
  AuthStatus,
  AuthStatusValue,
} from '@work-boost/data-schemas/auth.ts';
import {
  AIProviderSchema,
  AI_DEFAULT_MODELS,
  type ResolvedAIConfig,
} from '@work-boost/data-schemas/config.ts';
import { logger } from '@work-boost/shared/logger/logger.ts';

export type {
  AuthLoginEvent,
  AuthLoginSession,
  AuthStatus,
  AuthStatusValue,
  AIProviderDescriptor,
} from '@work-boost/data-schemas/auth.ts';

export type AuthLoginTerminalStatus = 'completed' | 'failed' | 'cancelled';

export interface AuthLoginCancellation {
  status: AuthLoginTerminalStatus;
}

export interface AuthPort {
  getStatus(): Promise<AuthStatus>;
  startLogin(options: {
    provider: string;
    type: AuthType;
    reauthenticate?: boolean;
  }): Promise<AuthLoginSession>;
  hasLogin(loginId: string): boolean;
  subscribe(loginId: string, listener: (event: AuthLoginEvent) => void): () => void;
  disconnect(loginId: string): void;
  cancelLogin(loginId: string): Promise<AuthLoginCancellation>;
  /** Resolve a pending `manual_code` prompt with a pasted code or redirect URL. */
  submitLoginCode(loginId: string, code: string): Promise<void>;
  logout(): Promise<{ provider: string; status: 'not_connected' }>;
  /** Store an API key for a provider, replacing any existing credential. */
  saveApiKey(provider: string, apiKey: string): Promise<void>;
  dispose?(): void;
}

export class AuthServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AuthServiceError';
    this.code = code;
    this.status = status;
  }
}

interface LoginSession {
  loginId: string;
  provider: string;
  expiresAt: number;
  controller: AbortController;
  events: AuthLoginEvent[];
  subscribers: Set<(event: AuthLoginEvent) => void>;
  terminal?: AuthLoginTerminalStatus;
  expiryTimer: ReturnType<typeof setTimeout>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

export interface AuthServiceDeps {
  ai: ResolvedAIConfig;
  models: Models;
  apiPrefix?: string;
  loginTimeoutMs?: number;
  terminalCleanupMs?: number;
  disconnectGraceMs?: number;
}

const DEFAULT_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_TERMINAL_CLEANUP_MS = 5_000;
const DEFAULT_DISCONNECT_GRACE_MS = 1_000;
const MAX_BUFFERED_EVENTS = 32;

function safePublicUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = '';
    if (url.protocol !== 'https:') return undefined;
    for (const key of [
      'access_token',
      'refresh_token',
      'authorization_code',
      'code_verifier',
      'client_secret',
      'secret',
      'token',
    ]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function sanitizePublicMessage(message: string): string {
  return message
    .replace(
      /(access_token|refresh_token|authorization_code|code_verifier|client_secret|secret|token|key|credential)\s*[:=]\s*[^\s,;&}]+/gi,
      '$1=[redacted]',
    )
    .slice(0, 200);
}
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'AbortError' || /abort|cancel/i.test(error.message))
  );
}

export class AuthService {
  ai: ResolvedAIConfig;
  private readonly models: Models;
  private readonly apiPrefix: string;
  private readonly loginTimeoutMs: number;
  private readonly terminalCleanupMs: number;
  private readonly disconnectGraceMs: number;
  private readonly sessions = new Map<string, LoginSession>();
  private activeLoginId?: string;
  private pendingPrompt?: {
    loginId: string;
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  };

  constructor(deps: AuthServiceDeps) {
    this.ai = deps.ai;
    this.models = deps.models;
    this.apiPrefix = deps.apiPrefix ?? '/api';
    this.loginTimeoutMs = deps.loginTimeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;
    this.terminalCleanupMs = deps.terminalCleanupMs ?? DEFAULT_TERMINAL_CLEANUP_MS;
    this.disconnectGraceMs = deps.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
  }

  /** Static metadata for every selectable provider, used by the auth panel. */
  private listProviders(): AIProviderDescriptor[] {
    return this.models.getProviders().map((provider) => {
      const known = AIProviderSchema.safeParse(provider.id);
      return {
        id: provider.id,
        name: provider.name,
        methods: [
          ...(provider.auth.oauth?.login ? ['oauth' as const] : []),
          ...(provider.auth.apiKey?.login ? ['api_key' as const] : []),
        ],
        // Providers without a server-side default (openrouter) need an
        // explicit model from the user before they can connect.
        requiresModel: known.success ? AI_DEFAULT_MODELS[known.data] === undefined : false,
      };
    });
  }

  /** Reconfigure the active provider/model in place (does not touch the store). */
  setAIConfig(ai: ResolvedAIConfig): void {
    this.ai = ai;
  }

  /**
   * Store an API key for a provider through the provider's interactive API-key
   * login flow. Replaces any previously stored credential for that provider.
   */
  async saveApiKey(provider: string, apiKey: string): Promise<void> {
    const value = apiKey.trim();
    if (!value) {
      throw new AuthServiceError('AUTH_API_KEY_REQUIRED', 'An API key is required', 400);
    }
    const configuredProvider = this.models.getProvider(provider);
    if (!configuredProvider?.auth.apiKey?.login) {
      throw new AuthServiceError(
        'AUTH_API_KEY_UNSUPPORTED',
        `Provider "${provider}" does not support API key login`,
        422,
      );
    }
    const signal = new AbortController().signal;
    await this.models.login(provider, 'api_key', {
      signal,
      prompt: async () => value,
      notify: () => undefined,
    });
  }

  async getStatus(): Promise<AuthStatus> {
    const provider = this.models.getProvider(this.ai.provider);
    const providers = this.listProviders();
    const base: Omit<AuthStatus, 'auth'> = {
      provider: this.ai.provider,
      model: this.ai.model,
      providers,
    };

    if (!provider) {
      return {
        ...base,
        auth: { supported: false, type: 'unsupported', status: 'unsupported' },
      };
    }

    // Which interactive login paths does this provider offer? A provider may
    // offer both (openrouter); OAuth is the primary/leading flow when present.
    const hasOauth = Boolean(provider.auth.oauth?.login);
    const hasApiKey = Boolean(provider.auth.apiKey?.login);

    if (!hasOauth && !hasApiKey) {
      return {
        ...base,
        auth: { supported: false, type: 'unsupported', status: 'unsupported' },
      };
    }

    const primaryType = hasOauth ? 'oauth' : 'api_key';
    let check;
    try {
      check = await this.models.checkAuth(this.ai.provider);
    } catch (error) {
      logger.warn('[AuthService.getStatus] auth check failed', {
        provider: this.ai.provider,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      return {
        ...base,
        auth: {
          supported: true,
          type: primaryType,
          status: 'refresh_failed',
          ...(primaryType === 'oauth' ? { source: 'OAuth' } : { source: 'API key' }),
        },
      };
    }

    if (!check) {
      return {
        ...base,
        auth: {
          supported: true,
          type: primaryType,
          status: 'not_connected',
          ...(primaryType === 'oauth' ? { source: 'OAuth' } : {}),
        },
      };
    }

    const oauthConfigured = check.type === 'oauth';
    try {
      const resolved = await this.models.getAuth(this.ai.provider);
      return {
        ...base,
        auth: {
          supported: true,
          type: oauthConfigured ? 'oauth' : 'api_key',
          status: resolved ? 'connected' : 'not_connected',
          ...(resolved?.source
            ? { source: resolved.source }
            : oauthConfigured
              ? { source: 'OAuth' }
              : {}),
        },
      };
    } catch (error) {
      logger.warn('[AuthService.getStatus] auth resolution failed', {
        provider: this.ai.provider,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      return {
        ...base,
        auth: {
          supported: true,
          type: oauthConfigured ? 'oauth' : 'api_key',
          status: 'refresh_failed',
          ...(oauthConfigured ? { source: 'OAuth' } : { source: 'API key' }),
        },
      };
    }
  }

  async startLogin(options: {
    provider: string;
    type: AuthType;
    reauthenticate?: boolean;
  }): Promise<AuthLoginSession> {
    if (options.provider !== this.ai.provider) {
      throw new AuthServiceError(
        'AUTH_PROVIDER_NOT_ACTIVE',
        'The requested provider is not active',
        409,
      );
    }
    if (options.type !== 'oauth') {
      throw new AuthServiceError(
        'AUTH_OAUTH_UNSUPPORTED',
        'Only OAuth login is supported by the browser',
        422,
      );
    }
    if (this.activeLoginId) {
      throw new AuthServiceError(
        'AUTH_LOGIN_IN_PROGRESS',
        'Another login is already in progress',
        409,
      );
    }
    const provider = this.models.getProvider(this.ai.provider);
    if (!provider?.auth.oauth?.login) {
      throw new AuthServiceError(
        'AUTH_OAUTH_UNSUPPORTED',
        'The active AI provider does not support browser OAuth login',
        422,
      );
    }

    if (!options.reauthenticate) {
      const status = await this.getStatus();
      if (status.auth.status === 'connected') {
        throw new AuthServiceError(
          'AUTH_ALREADY_CONNECTED',
          'The active AI provider is already connected',
          409,
        );
      }
    }

    const loginId = crypto.randomUUID();
    const expiresAt = Date.now() + this.loginTimeoutMs;
    const session: LoginSession = {
      loginId,
      provider: this.ai.provider,
      expiresAt,
      controller: new AbortController(),
      events: [],
      subscribers: new Set(),
      expiryTimer: setTimeout(() => this.expire(session), this.loginTimeoutMs),
    };
    this.sessions.set(loginId, session);
    this.activeLoginId = loginId;
    this.emit(session, { type: 'started', provider: this.ai.provider, authType: 'oauth' });
    void this.runLogin(session);

    return {
      loginId,
      provider: this.ai.provider,
      type: 'oauth',
      status: 'running',
      eventsUrl: `${this.apiPrefix}/auth/login/${loginId}/events`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  hasLogin(loginId: string): boolean {
    return this.sessions.has(loginId);
  }

  subscribe(loginId: string, listener: (event: AuthLoginEvent) => void): () => void {
    const session = this.sessions.get(loginId);
    if (!session) throw this.loginNotFound();
    for (const event of session.events) listener(event);
    if (!session.terminal) session.subscribers.add(listener);
    return () => session.subscribers.delete(listener);
  }

  disconnect(loginId: string): void {
    const session = this.sessions.get(loginId);
    if (!session || session.terminal) return;
    if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
    session.disconnectTimer = setTimeout(() => {
      session.disconnectTimer = undefined;
      if (!session.terminal && session.subscribers.size === 0) {
        void this.cancelLogin(loginId).catch(() => undefined);
      }
    }, this.disconnectGraceMs);
  }

  async cancelLogin(loginId: string): Promise<AuthLoginCancellation> {
    const session = this.sessions.get(loginId);
    if (!session) throw this.loginNotFound();
    if (session.terminal) return { status: session.terminal };
    clearTimeout(session.expiryTimer);
    session.controller.abort();
    this.finish(session, 'cancelled', {
      type: 'cancelled',
      message: 'Login cancelled',
    });
    return { status: 'cancelled' };
  }

  /**
   * Resolve a pending `manual_code` prompt with a pasted authorization code or
   * full redirect URL. Used by browser PKCE flows (e.g. OpenRouter) that race a
   * loopback callback server against a manual paste fallback.
   */
  async submitLoginCode(loginId: string, code: string): Promise<void> {
    const value = code.trim();
    if (!value) {
      throw new AuthServiceError(
        'AUTH_CODE_REQUIRED',
        'An authorization code or redirect URL is required',
        400,
      );
    }
    const session = this.sessions.get(loginId);
    if (!session || session.terminal) throw this.loginNotFound();
    const pending = this.pendingPrompt;
    if (!pending || pending.loginId !== loginId) {
      throw new AuthServiceError(
        'AUTH_NO_CODE_PROMPT',
        'No verification input is currently expected',
        409,
      );
    }
    pending.resolve(value);
  }

  async logout(): Promise<{ provider: string; status: 'not_connected' }> {
    if (this.activeLoginId) await this.cancelLogin(this.activeLoginId);
    await this.models.logout(this.ai.provider);
    return { provider: this.ai.provider, status: 'not_connected' };
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      clearTimeout(session.expiryTimer);
      if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
      if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
      session.controller.abort();
      session.subscribers.clear();
    }
    this.sessions.clear();
    this.activeLoginId = undefined;
    this.pendingPrompt = undefined;
  }

  private awaitManualCodeInput(
    session: LoginSession,
    prompt: { message: string; placeholder?: string; signal?: AbortSignal },
  ): Promise<string> {
    const message = sanitizePublicMessage(prompt.message);
    const placeholder = prompt.placeholder ? sanitizePublicMessage(prompt.placeholder) : undefined;
    this.emit(session, {
      type: 'manual_code',
      message,
      ...(placeholder ? { placeholder } : {}),
    });
    return new Promise<string>((resolve, reject) => {
      const clear = () => {
        if (this.pendingPrompt?.loginId === session.loginId) this.pendingPrompt = undefined;
      };
      this.pendingPrompt = {
        loginId: session.loginId,
        resolve: (value) => {
          clear();
          resolve(value);
        },
        reject: (error) => {
          clear();
          reject(error);
        },
      };
      const abortSignal = prompt.signal ?? session.controller.signal;
      const onAbort = () => {
        if (this.pendingPrompt?.loginId === session.loginId) {
          const abortError = new Error('Login cancelled');
          abortError.name = 'AbortError';
          this.pendingPrompt.reject(abortError);
        }
      };
      if (abortSignal.aborted) {
        onAbort();
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private async runLogin(session: LoginSession): Promise<void> {
    try {
      await this.models.login(session.provider, 'oauth', {
        signal: session.controller.signal,
        prompt: async (prompt) => {
          if (prompt.type === 'select') return 'device_code';
          if (prompt.type === 'manual_code' || prompt.type === 'text') {
            return this.awaitManualCodeInput(session, prompt);
          }
          throw new AuthServiceError(
            'AUTH_OAUTH_UNSUPPORTED',
            'This OAuth flow requires interactive input that the browser does not support',
            422,
          );
        },
        notify: (event: AuthEvent) => this.forwardEvent(session, event),
      });
      if (!session.terminal) {
        clearTimeout(session.expiryTimer);
        this.finish(session, 'completed', {
          type: 'completed',
          provider: session.provider,
          status: 'connected',
        });
      }
    } catch (error) {
      if (session.terminal || isAbortError(error)) return;
      clearTimeout(session.expiryTimer);
      logger.warn('[AuthService.runLogin] OAuth login failed', {
        provider: session.provider,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      this.finish(session, 'failed', {
        type: 'failed',
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'The AI provider could not complete authentication. Try again.',
      });
    }
  }

  private forwardEvent(session: LoginSession, event: AuthEvent): void {
    if (session.terminal) return;
    if (event.type === 'progress') {
      this.emit(session, { type: 'progress', message: sanitizePublicMessage(event.message) });
      return;
    }
    if (event.type === 'auth_url') {
      const url = safePublicUrl(event.url);
      if (!url) {
        this.finish(session, 'failed', {
          type: 'failed',
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'The provider returned an invalid authorization URL. Try again.',
        });
        return;
      }
      this.emit(session, {
        type: 'auth_url',
        url,
        ...(event.instructions ? { instructions: sanitizePublicMessage(event.instructions) } : {}),
      });
      return;
    }
    if (event.type === 'device_code') {
      const verificationUri = safePublicUrl(event.verificationUri);
      if (!verificationUri) {
        this.finish(session, 'failed', {
          type: 'failed',
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'The provider returned an invalid verification URL. Try again.',
        });
        return;
      }
      this.emit(session, {
        type: 'device_code',
        verificationUri,
        userCode: event.userCode.slice(0, 100),
        ...(event.intervalSeconds !== undefined ? { intervalSeconds: event.intervalSeconds } : {}),
        ...(event.expiresInSeconds !== undefined
          ? { expiresInSeconds: event.expiresInSeconds }
          : {}),
      });
    }
  }

  private emit(session: LoginSession, event: AuthLoginEvent): void {
    session.events.push(event);
    if (session.events.length > MAX_BUFFERED_EVENTS) session.events.shift();
    for (const subscriber of session.subscribers) subscriber(event);
  }

  private finish(
    session: LoginSession,
    status: AuthLoginTerminalStatus,
    event: AuthLoginEvent,
  ): void {
    if (session.terminal) return;
    session.terminal = status;
    clearTimeout(session.expiryTimer);
    if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
    if (this.activeLoginId === session.loginId) this.activeLoginId = undefined;
    if (this.pendingPrompt?.loginId === session.loginId) {
      const pendingPrompt = this.pendingPrompt;
      this.pendingPrompt = undefined;
      const abortError = new Error('Login cancelled');
      abortError.name = 'AbortError';
      pendingPrompt.reject(abortError);
    }
    this.emit(session, event);
    session.cleanupTimer = setTimeout(() => {
      session.subscribers.clear();
      this.sessions.delete(session.loginId);
    }, this.terminalCleanupMs);
  }

  private expire(session: LoginSession): void {
    if (session.terminal) return;
    session.controller.abort();
    this.finish(session, 'failed', {
      type: 'failed',
      code: 'AUTH_LOGIN_EXPIRED',
      message: 'Login expired. Start again.',
    });
  }

  private loginNotFound(): AuthServiceError {
    return new AuthServiceError('AUTH_LOGIN_NOT_FOUND', 'Login session was not found', 404);
  }
}
