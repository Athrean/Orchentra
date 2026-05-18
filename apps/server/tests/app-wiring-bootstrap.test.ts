/**
 * Wiring-level tests for the CLI bootstrap surface. Exercises the full
 * `createApp()` factory — public routes, middleware order, and shared
 * handoff store — so the production code path (not test stubs) is what
 * actually answers requests.
 *
 * These tests caught the three blockers raised on PR #381:
 *   1. `/api/install-handoff/start` not mounted publicly.
 *   2. `githubAppRouter` wired with default deps → no shared handoff store
 *      → state callbacks always resolve to invalid_state.
 *   3. Bootstrap-minted apiKey not recognized by requireAuth.
 *
 * Test seam: the by-owner / login-bound DB tables are not in scope here,
 * so we override the github-app callback's GH HTTP + recordInstallation
 * with in-memory fakes that exercise the real Hono wiring around them.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { createApp } from '../src/app'
import { createMemoryInstallHandoffStore, type InstallHandoffStore } from '../src/github/install-handoff-memory-store'
import type { InstallationApiResponse } from '../src/routes/github-app'
import type { Hono } from 'hono'

const VALID_STATE = 'a'.repeat(40)
const LOOPBACK = 'http://127.0.0.1:54321/install-cb'

let handoffStore: InstallHandoffStore
let recorded: Array<{ installationId: number; apiKeyHash?: string | null }>
let app: Hono

function buildApp(): Hono {
  return createApp({
    handoffStore,
    githubAppOverrides: {
      loadAppCredentials: () => ({ appId: '1', privateKey: 'pk', installationId: 1 }),
      mintJwt: async () => 'jwt',
      fetchInstallationMetadata: async (_jwt, installationId): Promise<InstallationApiResponse> => ({
        id: installationId,
        account: { login: 'Athrean', id: 7, type: 'Organization' },
        repository_selection: 'selected',
        permissions: {},
        events: [],
      }),
      recordInstallation: async (input) => {
        recorded.push({
          installationId: input.installationId,
          apiKeyHash: input.apiKeyHash ?? null,
        })
      },
      resolveOrgId: () => 'org-test',
      frontendUrl: () => 'http://localhost:3000',
    },
  })
}

beforeEach(() => {
  handoffStore = createMemoryInstallHandoffStore({ now: () => Date.now(), ttlMs: 5 * 60 * 1000 })
  recorded = []
  app = buildApp()
})

describe('createApp() — CLI bootstrap wiring', () => {
  test('POST /api/install-handoff/start is reachable without auth', async () => {
    // Blocker 1: /api/install-handoff/start must be mounted before the
    // `/api/*` requireAuth guard, otherwise a fresh CLI without an apiKey
    // can never start the handoff.
    const res = await app.request('/api/install-handoff/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: VALID_STATE, redirectUri: LOOPBACK }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  test('state-bearing callback redirects to the loopback with apiKey', async () => {
    // Blocker 2: githubAppRouter must be wired with the same shared
    // handoffStore that the start route writes to. With default deps the
    // callback's handoffStore is undefined and every state-bearing redirect
    // falls through to `error=invalid_state`.
    const startRes = await app.request('/api/install-handoff/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: VALID_STATE, redirectUri: LOOPBACK }),
    })
    expect(startRes.status).toBe(200)

    const cbRes = await app.request(`/auth/github/app/callback?installation_id=42&state=${VALID_STATE}`)
    expect(cbRes.status).toBe(302)
    const location = cbRes.headers.get('location')
    expect(location).not.toBeNull()
    const url = new URL(location as string)
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe(LOOPBACK)
    expect(url.searchParams.get('error')).toBeNull()
    expect(url.searchParams.get('apiKey')).toBeTruthy()
    expect(url.searchParams.get('installationId')).toBe('42')
  })
})
