export type AuthStatusValue = 'connected' | 'not_connected' | 'refresh_failed' | 'unsupported';

export type AuthMethod = 'oauth' | 'api_key';

/** Static metadata for one selectable AI provider, used by the auth panel. */
export interface AIProviderDescriptor {
  id: string;
  name: string;
  /** Auth methods the provider actually supports for interactive login. */
  methods: AuthMethod[];
}

export interface AuthStatus {
  provider: string;
  model: string;
  /** Available selectable AI providers (present on fresh/unconfigured installs). */
  providers?: AIProviderDescriptor[];
  auth: {
    supported: boolean;
    type: 'oauth' | 'api_key' | 'unsupported';
    status: AuthStatusValue;
    source?: string;
  };
}

/** Request body for switching the active AI provider/model. */
export interface AIConfigSetRequest {
  provider: string;
  model?: string;
}

export type AuthLoginEvent =
  | { type: 'started'; provider: string; authType: 'oauth' }
  | { type: 'auth_url'; url: string; instructions?: string }
  | {
      type: 'device_code';
      verificationUri: string;
      userCode: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { type: 'progress'; message: string }
  | { type: 'completed'; provider: string; status: 'connected' }
  | { type: 'failed'; code: string; message: string }
  | { type: 'cancelled'; message: string };

export interface AuthLoginSession {
  loginId: string;
  provider: string;
  type: 'oauth';
  status: 'running';
  eventsUrl: string;
  expiresAt: string;
}
