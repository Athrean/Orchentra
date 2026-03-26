# Core Auth & Product Foundation — Design Spec

**Goal:** Replace YAML-only configuration with a proper product foundation: GitHub OAuth login, server-side sessions, API keys for programmatic access, and a repo selection flow — all backed by PostgreSQL and validated with Zod.

**Architecture:** Self-hosted, single-tenant. GitHub OAuth provides user identity. A server-level PAT (from `orchentra.yml`) handles all GitHub API calls. Sessions live in PostgreSQL. API keys are a separate auth mechanism for CI/scripts. Monitored repos move from YAML config to a DB table with a UI-driven selection flow.

**Tech Stack:** Arctic (GitHub OAuth), Hono middleware, Drizzle ORM + PostgreSQL, Zod (shared schemas in `packages/core`), `crypto.randomBytes` for session tokens and API keys.

---

## 1. Database Schema

### 1.1 New Tables

**`users`**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK (UUID) |
| `githubId` | integer | unique, not null |
| `username` | text | not null |
| `displayName` | text | nullable |
| `avatarUrl` | text | nullable |
| `email` | text | nullable |
| `createdAt` | timestamp | default now() |
| `updatedAt` | timestamp | default now() |

**`sessions`**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK — `crypto.randomBytes(32).toString('hex')`, NOT UUID |
| `userId` | text | FK → users, not null |
| `expiresAt` | timestamp | not null (30 days from creation) |
| `createdAt` | timestamp | default now() |

Indexes: `sessions.userId`

**`apiKeys`**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK (UUID) |
| `userId` | text | FK → users, not null |
| `name` | text | not null |
| `keyHash` | text | not null — SHA-256 of full key |
| `keyPrefix` | text | not null — first 8 chars for display |
| `lastUsedAt` | timestamp | nullable |
| `expiresAt` | timestamp | nullable |
| `createdAt` | timestamp | default now() |

Indexes: `apiKeys.keyHash`, `apiKeys.userId`

**`monitoredRepos`**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text | PK (UUID) |
| `repo` | text | unique, not null — `owner/repo` format |
| `addedBy` | text | FK → users, **nullable** (null for YAML-seeded repos) |
| `createdAt` | timestamp | default now() |

### 1.2 Existing Tables

`incidents` and `toolCalls` — unchanged.

### 1.3 Session Token Security

Session IDs MUST be generated via `crypto.randomBytes(32).toString('hex')` — 256 bits of CSPRNG entropy. Not UUID. Session tokens are a security primitive; the entropy source must be explicit and unambiguous.

---

## 2. Authentication

### 2.1 GitHub OAuth Flow (Arctic)

1. `GET /auth/github` — generate CSPRNG `state`, store in short-lived HTTP-only cookie (`oauth_state`, 10 min TTL), redirect to GitHub authorize URL. Scopes: `read:user, user:email`.
2. GitHub redirects → `GET /auth/github/callback`
3. Validate `state` matches cookie. **Clear the `oauth_state` cookie immediately after validation** (whether it matches or not).
4. Exchange code for access token via Arctic.
5. Fetch GitHub user profile (`GET /user` with token).
6. Upsert `users` row (match on `githubId`). Update `username`, `displayName`, `avatarUrl`, `email`, `updatedAt` on every login.
7. Create session: insert into `sessions` with 30-day expiry.
8. Set `session` HTTP-only cookie: `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=30 days`.
9. Redirect to `/dashboard`.

**Logout:** `POST /auth/logout` — delete session row from DB, clear `session` cookie.

### 2.2 Session Middleware

Hono middleware applied to protected routes:

1. Read `session` cookie from request.
2. Look up session by ID, join with `users`.
3. If missing or `expiresAt < now()`: return 401 (API routes) or redirect to `/auth/github` (page routes).
4. **Rolling expiry:** only extend if session has <15 days remaining. When extending, set new `expiresAt` = now + 30 days. This avoids a DB write on every single request.
5. Attach user to Hono context: `c.set('user', user)`.

### 2.3 API Key Middleware

Separate middleware for `/api/*` routes:

1. Read `Authorization: Bearer orch_...` header.
2. SHA-256 hash the full key.
3. Look up by `keyHash` index.
4. If valid and not expired: update `lastUsedAt`, attach user to context.
5. If invalid: return 401.

### 2.4 Combined Auth Middleware (`requireAuth`)

For routes that accept either auth method:

1. **Check API key header first.** If `Authorization: Bearer orch_...` is present, validate it. If valid, done. If invalid, return 401 immediately (don't fall through to cookie).
2. **Fall back to session cookie.** If no API key header, check session cookie.
3. **If neither:** return 401 or redirect.

**Precedence rule:** API key wins if both are present. This supports CI contexts where a cookie might be leftover from a browser session. Document this in the middleware source.

### 2.5 Route Protection

| Route pattern               | Auth required      | Method            |
| --------------------------- | ------------------ | ----------------- |
| `GET /auth/github`          | No                 | —                 |
| `GET /auth/github/callback` | No                 | —                 |
| `POST /auth/logout`         | Session only       | Cookie            |
| `POST /webhooks/github`     | No (HMAC verified) | Webhook signature |
| `GET /api/*`                | Yes                | Cookie or API key |
| `POST /api/*`               | Yes                | Cookie or API key |
| `DELETE /api/*`             | Yes                | Cookie or API key |

---

## 3. API Key Management

### 3.1 Endpoints

**`GET /api/keys`** — list all keys for current user.

- Response: `{ keys: [{ id, name, keyPrefix, lastUsedAt, expiresAt, createdAt }] }`
- Never returns hash or full key.

**`POST /api/keys`** — create a new key.

- Request body: `{ name: string, expiresAt?: string }` (Zod validated)
- Generate: `orch_` + `crypto.randomBytes(32).toString('hex')` (64 hex chars)
- Store: SHA-256 hash of full key, first 8 chars as prefix
- Response: `{ id, name, key, keyPrefix, expiresAt, createdAt }`
- **`key` field is returned exactly once.** After this response, the plaintext is gone forever.

**`DELETE /api/keys/:id`** — revoke a key.

- Verify the key belongs to the current user before deleting.
- Returns 204 on success.

### 3.2 Key Format

`orch_` + 64 hex characters (32 bytes of randomness). The prefix makes keys:

- Greppable in logs and config files
- Distinguishable from GitHub PATs, Slack tokens, etc.
- Identifiable by secret scanners

---

## 4. Repo Selection

### 4.1 Endpoints

**`GET /api/repos/available`** — list all repos accessible to the server PAT.

- Calls GitHub API: `GET /user/repos` (paginated, all pages)
- Cross-references with `monitoredRepos` table
- Response: `{ repos: [{ fullName, owner, name, private, description, monitored }] }`
- **Cached** in memory with 60s TTL (separate cache entry from monitored repos)

**`POST /api/repos/monitor`** — start monitoring a repo.

- Body: `{ repo: "owner/repo" }` (Zod validated)
- Validates repo exists in the cached available list (won't monitor a repo the PAT can't access)
- Inserts into `monitoredRepos` with current user as `addedBy`
- Invalidates the monitored repos cache
- Returns 201

**`DELETE /api/repos/monitor`** — stop monitoring a repo.

- Body: `{ repo: "owner/repo" }` (Zod validated)
- Deletes from `monitoredRepos`
- Invalidates the monitored repos cache
- Returns 204

### 4.2 Config Migration (First Boot Seed)

On server startup:

1. Check if `monitoredRepos` table has any rows.
2. If empty AND `config.github.repos` has entries: insert each repo with `addedBy = null`.
3. After seed, `monitoredRepos` DB table is the sole source of truth.
4. `config.github.repos` becomes optional in the config schema (backward compatible).

### 4.3 Webhook Handler Change

Current: `config.github.repos.includes(repo)` (in-memory array from YAML).

New: Query `monitoredRepos` table via in-memory cache (60s TTL, separate cache entry). Comparison is case-insensitive (`LOWER(repo)`).

### 4.4 Cache Design (`repo-cache.ts`)

Two separate cache entries in a single module:

- `monitoredRepos` — set of repo names for webhook allowlist checking. 60s TTL.
- `availableRepos` — list of repos from GitHub API for toggle validation. 60s TTL.

Separate keys, separate TTLs (even if both start at 60s), so they can be tuned independently. Cache invalidation exposed as named functions (`invalidateMonitoredReposCache`, `invalidateAvailableReposCache`).

---

## 5. Zod Schema Strategy

### 5.1 Hard Rule

**All API contract types live in `packages/core` only.** No inline Zod schemas in route files. No `as` casts. No `JSON.parse` without validation. This is enforced by code review discipline.

### 5.2 New Schema Files in `packages/core/src/`

**`schemas/auth.ts`**

- `UserSchema` — id, githubId, username, displayName, avatarUrl, email
- `SessionSchema` — id, userId, expiresAt
- `LoginResponseSchema` — user info returned after OAuth
- `LogoutResponseSchema`

**`schemas/api-keys.ts`**

- `CreateApiKeyRequestSchema` — { name, expiresAt? }
- `CreateApiKeyResponseSchema` — { id, name, key, keyPrefix, expiresAt, createdAt }
- `ApiKeyListItemSchema` — { id, name, keyPrefix, lastUsedAt, expiresAt, createdAt }
- `ApiKeyListResponseSchema` — { keys: ApiKeyListItemSchema[] }

**`schemas/repos.ts`**

- `AvailableRepoSchema` — { fullName, owner, name, private, description, monitored }
- `AvailableReposResponseSchema` — { repos: AvailableRepoSchema[] }
- `MonitorRepoRequestSchema` — { repo: string } with regex validation for `owner/repo` format
- `MonitoredRepoSchema` — { id, repo, addedBy, createdAt }

### 5.3 Existing Schemas

`BriefSchema`, `IncidentBrief`, `IncidentStatus` in `packages/core/src/types.ts` — unchanged.

---

## 6. File Structure

### 6.1 New Files

```
packages/core/src/
  schemas/
    auth.ts          — user, session, login/logout schemas
    api-keys.ts      — API key CRUD schemas
    repos.ts         — repo listing and monitoring schemas

packages/db/src/
  schema.ts          — add users, sessions, apiKeys, monitoredRepos tables + indexes

apps/server/src/
  auth/
    oauth.ts         — Arctic setup, GitHub OAuth handlers, user upsert
    session.ts       — session CRUD, cookie helpers, token generation
    middleware.ts     — requireSession, requireApiKey, requireAuth middlewares
  routes/
    auth.ts          — GET /auth/github, GET /auth/github/callback, POST /auth/logout
    repos.ts         — GET /api/repos/available, POST + DELETE /api/repos/monitor
    api-keys.ts      — GET /api/keys, POST /api/keys, DELETE /api/keys/:id
  lib/
    repo-cache.ts    — dual in-memory cache (monitored + available), separate TTLs
```

### 6.2 Modified Files

```
packages/db/src/schema.ts        — add 4 new tables + indexes
apps/server/src/config-schema.ts — make github.repos optional
apps/server/src/routes/webhooks.ts — read from monitoredRepos cache instead of config
apps/server/src/index.ts         — register new routes, run config seed on startup
apps/server/package.json         — add arctic dependency
```

### 6.3 Untouched

Agent runner, prompts, tools, Slack message posting, existing tests — all unchanged.

---

## 7. Issue Breakdown

| #   | Issue                                               | Scope                                        |
| --- | --------------------------------------------------- | -------------------------------------------- |
| 1   | DB schema: users, sessions, apiKeys, monitoredRepos | `packages/db` schema + migration             |
| 2   | Zod schemas for auth, API keys, repos               | `packages/core/src/schemas/`                 |
| 3   | GitHub OAuth login + session management             | Arctic, `auth/` module, `/auth/*` routes     |
| 4   | Auth middleware (session + API key + combined)      | `auth/middleware.ts`, route protection       |
| 5   | API key management endpoints                        | `/api/keys` CRUD routes                      |
| 6   | Repo selection + config migration                   | `/api/repos/*` routes, cache, webhook update |
| 7   | Fix pre-existing test mock isolation failures       | Bun `mock.module` cross-file leaking         |

Issues 1-2 are foundations (no deps). Issue 3 depends on 1+2. Issue 4 depends on 3. Issues 5-6 depend on 4. Issue 7 is independent.

---

## 8. Out of Scope

- Frontend pages (login, dashboard, settings, repo selection UI) — separate design
- Multi-tenant / org model
- GitHub App installation flow
- Changes to the agent pipeline
- Rate limiting on auth endpoints (future hardening)
