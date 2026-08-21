# Frontend OAuth Login Plan

## Goal

Allow a Work Boost user to authenticate the active OAuth-capable AI provider from the browser without copying secrets into the frontend, workspace configuration, or an environment file.

The first release targets OpenAI Codex OAuth through the device-code flow. The design must support additional providers later without exposing provider-specific OAuth implementation details to React.

## Current limitation

The configurable-provider implementation already supports server-side credential loading and OAuth refresh through `pi-ai`, but it does not expose `Models.login()` through the API. The frontend currently has no authentication status, login endpoint, or OAuth progress UI.

The frontend must not import or execute `pi-ai` OAuth flows directly. The current OpenAI Codex and OpenRouter OAuth implementations depend on Node.js APIs and server-side credential persistence.

## Decisions

- OAuth is owned by the API process. The browser only starts login, opens a verification URL, displays a user code, and receives non-secret status events.
- OAuth access and refresh tokens never appear in HTTP responses, SSE events, browser storage, logs, or React state.
- Login applies only to the active configured provider. It does not change `AI_PROVIDER`, `AI_MODEL`, or `.workboost/config.json`.
- Provider and model changes still require an API restart, as defined by `configurable-ai-provider-plan.md`.
- A successful login does not require an API restart. The existing `Brain` model collection reads the persisted credential on the next request.
- The first release supports OpenAI Codex device-code login because it works when the browser and API run on different machines.
- OpenRouter OAuth is not exposed in the first release. The current pi-ai OpenRouter flow uses a server-local loopback callback and is not safe for a remote browser without a callback adapter. OpenRouter API keys remain supported through the existing credential and environment-variable paths.
- Only one login may be active per API process. A second login attempt returns a conflict instead of replacing the first flow.
- Login sessions are short-lived, in-memory, and invalidated after completion, cancellation, expiry, or API shutdown.
- Automated tests use fake provider login interactions and never contact an OAuth provider.

## User flow

### OpenAI Codex device-code login

```text
Copilot drawer
      |
      | GET /api/auth/status
      v
Not connected: OpenAI Codex
      |
      | POST /api/auth/login
      v
API creates login session
      |
      | GET /api/auth/login/:loginId/events (SSE)
      v
API emits device_code
      |
      v
Frontend shows URL + user code and opens verification URL
      |
      v
API polls OpenAI until authorization completes
      |
      v
API persists ~/.pi/agent/auth.json atomically
      |
      v
API emits completed
      |
      v
Frontend shows Connected and enables Copilot
```

The frontend must not poll OpenAI directly. The backend owns polling, cancellation, token exchange, and credential persistence.

## Scope

### Included

- Backend authentication service around the existing `pi-ai` `Models.login()` API.
- Authentication status endpoint for the active provider.
- Login-session creation, SSE progress events, cancellation, timeout, and logout.
- OpenAI Codex device-code login from the existing Copilot UI.
- Persistent storage through the existing `FileCredentialStore`.
- Stable API errors for inactive providers, unsupported auth types, concurrent logins, cancellation, and expiry.
- Unit, route, frontend, and manual end-to-end coverage.

### Not included

- Browser-side OAuth token handling.
- User accounts or multi-user authorization for the Work Boost API.
- Changing AI provider or model from the frontend.
- OpenRouter loopback callback adaptation.
- API-key entry UI. API keys continue to be configured through environment variables or the server-side pi credential file.
- Storing credentials in `.workboost/config.json`, browser local storage, IndexedDB, cookies, or the workspace Markdown files.

## Backend design

### Authentication boundary

Add an app-owned authentication service rather than exposing `Models` or `CredentialStore` to HTTP routes.

Suggested responsibilities:

```text
AuthService
  |- getStatus()                  -> non-secret status
  |- startLogin(type, callbacks)  -> login session
  |- cancelLogin(loginId)
  `- logout()

AuthService owns:
  |- active provider/model
  |- pi-ai Models collection
  |- FileCredentialStore
  |- login-session registry
  `- provider-specific interaction adaptation
```

The service should call:

```ts
await models.login('openai-codex', 'oauth', interaction);
```

The `interaction` adapter maps pi-ai events to the login session event stream:

- `notify({ type: 'device_code', ... })` becomes a public `device_code` event.
- `notify({ type: 'progress', ... })` becomes a public `progress` event.
- `notify({ type: 'auth_url', ... })` is supported for future providers but is not the primary OpenAI Codex device-code path.
- `prompt()` returns the provider-specific choice without exposing a generic terminal prompt to the browser. For OpenAI Codex v1, select `device_code` automatically.

Do not return the `Credential` returned by `models.login()`. Persisting it is the responsibility of the injected credential store, and API responses expose only status metadata.

### Active provider rules

The service must compare the requested provider with the resolved `Brain.ai.provider`.

- If they differ, return `AUTH_PROVIDER_NOT_ACTIVE` with HTTP `409`.
- If the active provider has no OAuth method, return `AUTH_OAUTH_UNSUPPORTED` with HTTP `422`.
- If the active provider is already configured, return status `connected` without starting a new login unless the request explicitly asks to reauthenticate.
- Login completion must not alter the configured provider or model.

The current `Brain` keeps its `Models` collection private. Add a narrow authentication port or an `AuthService` dependency during bootstrap rather than exposing the collection publicly.

### Login session lifecycle

Each login receives a cryptographically random `loginId` with at least 128 bits of entropy.

```text
created -> running -> awaiting_user -> completed
                         |       |
                         v       v
                      cancelled failed
```

Session requirements:

- Store sessions only in memory.
- Expire sessions after 10 minutes unless the provider completes first.
- Keep a bounded event buffer so an SSE client that connects immediately after `POST` receives the current state.
- Allow one SSE subscriber per login session. A reconnect may resume from the buffered events.
- Cancel the provider interaction with `AbortController` on cancellation, expiry, client disconnect after a short grace period, or server shutdown.
- Remove credentials only through the explicit logout endpoint. A failed or cancelled login must not delete an existing valid credential.
- Remove the session and all buffered events after terminal-state delivery and a short cleanup delay.

## HTTP API

All routes use the existing response envelope from `apps/api/src/utils/response.ts` and the configured API prefix.

### `GET /api/auth/status`

Returns non-secret authentication state for the active provider.

Response data:

```json
{
  "provider": "openai-codex",
  "model": "gpt-5.4-mini",
  "auth": {
    "supported": true,
    "type": "oauth",
    "status": "connected",
    "source": "stored credential"
  }
}
```

Allowed `status` values:

- `connected`: a stored or ambient credential is available.
- `not_connected`: no usable credential is configured.
- `refresh_failed`: a stored OAuth credential exists but refresh failed. Do not silently fall back to an environment key.
- `unsupported`: the active provider does not expose OAuth login.

The response must never include access tokens, refresh tokens, API keys, authorization headers, or raw provider credentials.

`source` must be a safe label such as `OAuth`, `ZAI_API_KEY`, or `stored credential`. It must not contain a secret or local path that reveals sensitive user information.

### `POST /api/auth/login`

Starts login for the active provider. The explicit provider field prevents the frontend from accidentally authorizing a provider different from the one the Brain uses.

Request:

```json
{
  "provider": "openai-codex",
  "type": "oauth",
  "reauthenticate": false
}
```

Response: HTTP `202`.

```json
{
  "loginId": "random-login-id",
  "provider": "openai-codex",
  "type": "oauth",
  "status": "running",
  "eventsUrl": "/api/auth/login/random-login-id/events",
  "expiresAt": "2026-02-21T12:10:00.000Z"
}
```

Validation and errors:

- `400 VALIDATION_ERROR`: malformed request.
- `409 AUTH_LOGIN_IN_PROGRESS`: another login is active.
- `409 AUTH_PROVIDER_NOT_ACTIVE`: requested provider is not the configured provider.
- `422 AUTH_OAUTH_UNSUPPORTED`: active provider has no OAuth login flow.
- `503 AUTH_SERVICE_UNAVAILABLE`: the login flow cannot be initialized.

The endpoint must not wait for the OAuth flow to finish.

### `GET /api/auth/login/:loginId/events`

Returns an SSE stream with `Cache-Control: no-store` and `X-Accel-Buffering: no`.

Event format:

```text
event: device_code
data: {"verificationUri":"https://auth.openai.com/codex/device","userCode":"ABCD-EFGH","expiresInSeconds":900,"intervalSeconds":5}

event: progress
data: {"message":"Waiting for authorization"}

event: completed
data: {"provider":"openai-codex","status":"connected"}
```

Public event types:

```ts
type AuthLoginEvent =
  | { type: 'started'; provider: string; authType: 'oauth' }
  | {
      type: 'auth_url';
      url: string;
      instructions?: string;
    }
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
```

Security requirements:

- Never forward raw provider errors if they contain response bodies, tokens, authorization codes, or request headers.
- Do not emit credential objects from `models.login()`.
- Validate `loginId` format and return `404 AUTH_LOGIN_NOT_FOUND` for unknown or expired sessions.
- Complete terminal events before closing the stream.

### `POST /api/auth/login/:loginId/cancel`

Cancels an active login session.

Response: HTTP `200` with `{ "status": "cancelled" }`.

Cancellation must be idempotent. Cancelling a completed or already-cancelled session returns its terminal status rather than starting any new work.

### `POST /api/auth/logout`

Deletes the active provider credential through `CredentialStore.delete(providerId)`.

Response:

```json
{
  "provider": "openai-codex",
  "status": "not_connected"
}
```

Logout must not modify workspace configuration or environment variables. It must serialize against an in-progress OAuth refresh or login write.

## Frontend design

### Location

Add authentication controls to `AiCopilotDrawer`. Do not add a separate account system or settings page for this first release.

When the drawer opens, load `GET /api/auth/status` once and refresh after a terminal login event.

### States

```text
loading
  |
  +-- connected       -> normal Copilot composer
  |
  +-- not_connected   -> Connect button
  |
  +-- login_running   -> URL/code instructions, progress, Cancel
  |
  +-- failed          -> safe error, Retry
  `-- refresh_failed  -> Reconnect button and explanation
```

For OpenAI Codex device-code login:

1. Show the active provider and model.
2. Start login on `Connect OpenAI Codex`.
3. Open `verificationUri` in a new tab only after a user click.
4. Display `userCode` with a copy button.
5. Display progress while the SSE connection remains open.
6. On `completed`, show `Connected` and restore the composer.
7. On `failed`, show the safe API error and retain a `Retry` action.
8. On drawer close or explicit Cancel, cancel the session and close the SSE stream.

The UI must not render or store any credential fields. It may retain the `loginId` only in component state for the active session.

Suggested client additions:

- `api.getAuthStatus()`
- `api.startAuthLogin()`
- `api.subscribeAuthLogin(loginId, onEvent, onError)`
- `api.cancelAuthLogin(loginId)`
- `api.logoutAuth()`

`api-client.ts` should reuse the existing `ApiError` and response-envelope handling. SSE parsing must handle reconnects, terminal events, and malformed events without crashing the drawer.

### UX copy

Use clear copy that does not imply the frontend stores the token:

- `Connect OpenAI Codex`
- `Open the verification page and enter this code`
- `Waiting for authorization...`
- `OpenAI Codex connected`
- `Login expired. Start again.`
- `The AI provider is unavailable. Check the server configuration or reconnect.`

## Error contract

Add stable error codes without exposing provider internals:

```ts
AUTH_LOGIN_IN_PROGRESS
AUTH_LOGIN_NOT_FOUND
AUTH_LOGIN_EXPIRED
AUTH_LOGIN_CANCELLED
AUTH_PROVIDER_NOT_ACTIVE
AUTH_OAUTH_UNSUPPORTED
AUTH_SERVICE_UNAVAILABLE
AUTH_REFRESH_FAILED
```

The existing `AI_UNAVAILABLE` response remains the error returned by Copilot requests when authentication is missing or unusable. Authentication endpoints should use the more specific codes above.

## Security requirements

- Use `crypto.randomUUID()` or equivalent for login-session identifiers.
- Use an `AbortController` for every login and enforce a server-side timeout.
- Apply the existing API rate limiter to login creation, cancellation, and logout.
- Preserve existing CORS behavior. Do not broaden allowed origins for OAuth.
- Do not put access tokens, refresh tokens, API keys, authorization codes, PKCE verifiers, or raw OAuth responses in logs.
- Redact provider URLs if a future provider places sensitive values in query parameters. The URL sent to the browser must be the provider-generated authorization URL and must not contain a token.
- Set `Cache-Control: no-store` on status, login, SSE, and logout responses.
- Make login and logout safe against concurrent credential refreshes through the existing `CredentialStore` serialization.
- The API must remain the only component that can read `PI_AUTH_PATH`.

## Implementation files

Likely files:

- New `packages/brain/src/auth-service.ts` or equivalent app-owned auth module.
- `packages/brain/src/index.ts` for exported auth types.
- `packages/brain/src/types.ts` for the narrow auth port and status types.
- `apps/api/src/bootstrap.ts` to construct and return the auth service.
- `apps/api/src/server.ts` to register auth routes and SSE handling.
- New `apps/api/src/routes/auth.ts` for HTTP validation and response mapping.
- `apps/api/src/utils/response.ts` for stable auth error codes.
- `apps/web/src/lib/api-client.ts` for auth methods and SSE subscription.
- `apps/web/src/components/ai/AiCopilotDrawer.tsx` for the login UI.
- New backend and frontend tests beside existing route and component tests.
- `README.md` and `docs/ARCHITECTURE.md` for the user-facing and system documentation.

Keep provider-specific OAuth logic inside `pi-ai`. The application layer should only select the auth type, adapt interaction callbacks, persist through the injected store, and expose safe events.

## Testing plan

### Backend unit tests

Use a fake `Models` or fake provider login implementation to verify:

- Device-code events are translated to public events.
- Credentials are persisted through `CredentialStore.modify`.
- Credential values never appear in emitted events or status responses.
- Login timeout aborts the provider interaction.
- Cancellation aborts the provider interaction and preserves an existing credential.
- A second login is rejected while one is running.
- Inactive providers are rejected.
- Unsupported OAuth providers are rejected.
- Logout deletes only the active provider credential.
- Login sessions are removed after terminal completion.

### API route tests

Cover:

- `GET /api/auth/status` for connected, unconfigured, unsupported, and refresh-failed states.
- `POST /api/auth/login` returns `202` and a login ID.
- SSE emits ordered `started`, provider progress, and terminal events.
- Unknown and expired login IDs return stable errors.
- Cancellation is idempotent.
- Credentials and raw OAuth response data are absent from serialized responses.
- Rate limiting and CORS behavior remain enforced.

### Frontend tests

Cover:

- Unconfigured state renders a Connect button.
- Starting login renders the device URL, code, progress, and Cancel action.
- Completion returns the drawer to the normal composer.
- Failure renders a retry action without exposing secrets.
- Closing or cancelling unsubscribes from SSE and cancels the backend session.
- Malformed SSE events do not crash the component.

All automated tests must be deterministic and offline.

## Manual end-to-end verification

Run the API and browser in an isolated temporary HOME with a test or development credential setup.

1. Configure `AI_PROVIDER=openai-codex` and `AI_MODEL=gpt-5.4-mini`.
2. Open the browser Copilot drawer.
3. Confirm the drawer reports `Not connected` without exposing filesystem paths or secrets.
4. Click `Connect OpenAI Codex`.
5. Confirm a verification URL and user code appear.
6. Complete the device login in the browser.
7. Confirm the drawer reports `Connected`.
8. Send `I finished the API integration today.`.
9. Confirm Copilot performs the existing Markdown tool-backed write.
10. Confirm the daily note is created or updated.
11. Reload the page and confirm status remains connected.
12. Log out and confirm the next Copilot request returns `503 AI_UNAVAILABLE` until login or another credential is configured.
13. Confirm no token appears in browser DevTools responses, page storage, API logs, or workspace files.

Do not commit generated credentials or the temporary workspace.

## Acceptance criteria

- A browser user can start OpenAI Codex OAuth without entering an API key.
- Device-code instructions and progress are visible in the Copilot drawer.
- OAuth credentials are exchanged, persisted, refreshed, and used only by the API process.
- No access token, refresh token, API key, or PKCE secret reaches the frontend.
- Login and logout operate on the active configured provider only.
- Provider/model configuration remains server-side and still follows the restart rule.
- Cancellation, expiry, failures, and concurrent attempts have stable behavior.
- Existing Copilot tool execution and `AI_UNAVAILABLE` behavior remain intact.
- Automated tests are offline and deterministic.
- Manual verification confirms a successful OAuth-backed Markdown write.
