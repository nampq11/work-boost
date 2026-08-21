export type AuthStatusValue = 'connected' | 'not_connected' | 'refresh_failed' | 'unsupported';

export interface AuthStatus {
  provider: string;
  model: string;
  auth: {
    supported: boolean;
    type: 'oauth' | 'unsupported';
    status: AuthStatusValue;
    source?: string;
  };
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
