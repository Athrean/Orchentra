import { describe, expect, test, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import {
  createGithubAppRouter,
  type GithubAppCallbackDeps,
  type InstallationApiResponse,
} from '../src/routes/github-app'

interface TestState {
  metadataCalls: number[]
  recordedInstallations: Record<string, unknown>[]
  metadataShouldThrow: boolean
  recordShouldThrow: boolean
  metadataResponse: InstallationApiResponse
  loadCredsResult: { appId: number; privateKey: string } | null
}

function makeState(): TestState {
  return {
    metadataCalls: [],
    recordedInstallations: [],
    metadataShouldThrow: false,
    recordShouldThrow: false,
    metadataResponse: {
      id: 8675309,
      account: { login: 'Athrean', id: 1, type: 'Organization' },
      repository_selection: 'selected',
      permissions: { contents: 'read', metadata: 'read' },
      events: ['workflow_run', 'pull_request'],
    },
    loadCredsResult: { appId: 3617072, privateKey: 'stub' },
  }
}

function makeApp(state: TestState): Hono {
  const deps: Partial<GithubAppCallbackDeps> = {
    loadAppCredentials: () => state.loadCredsResult,
    mintJwt: async () => 'fake-jwt-token',
    fetchInstallationMetadata: async (_jwt, installationId) => {
      state.metadataCalls.push(installationId)
      if (state.metadataShouldThrow) throw new Error('boom')
      return state.metadataResponse
    },
    recordInstallation: async (input) => {
      if (state.recordShouldThrow) throw new Error('persist explode')
      state.recordedInstallations.push(input)
      return input
    },
    resolveOrgId: () => 'Athrean',
    frontendUrl: () => 'http://localhost:3000',
  }
  const app = new Hono()
  app.route('/auth/github/app', createGithubAppRouter(deps))
  return app
}

let state: TestState
beforeEach(() => {
  state = makeState()
})

describe('GET /auth/github/app/callback', () => {
  test('happy path: fetches install metadata, persists row, redirects to dashboard', async () => {
    const app = makeApp(state)
    const res = await app.request('/auth/github/app/callback?installation_id=8675309&setup_action=install')

    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/dashboard/integrations')
    expect(location).toContain('installed=8675309')
    expect(location).toContain('setup_action=install')

    expect(state.metadataCalls).toEqual([8675309])
    expect(state.recordedInstallations.length).toBe(1)
    expect(state.recordedInstallations[0].installationId).toBe(8675309)
    expect(state.recordedInstallations[0].repositorySelection).toBe('selected')
  })

  test('redirects with error when installation_id is missing', async () => {
    const app = makeApp(state)
    const res = await app.request('/auth/github/app/callback?setup_action=install')

    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('error=missing_installation_id')
  })

  test('redirects with error when installation_id is non-numeric', async () => {
    const app = makeApp(state)
    const res = await app.request('/auth/github/app/callback?installation_id=not-a-number')
    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('error=invalid_installation_id')
  })

  test('redirects with error when App credentials are unavailable', async () => {
    state.loadCredsResult = null
    const app = makeApp(state)
    const res = await app.request('/auth/github/app/callback?installation_id=8675309')
    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('error=app_credentials_unavailable')
    expect(state.metadataCalls.length).toBe(0)
  })

  test('redirects with error when GH metadata fetch fails', async () => {
    state.metadataShouldThrow = true
    const app = makeApp(state)
    const res = await app.request('/auth/github/app/callback?installation_id=8675309')
    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('error=metadata_fetch_failed')
    expect(state.recordedInstallations.length).toBe(0)
  })

  test('redirects with error when persisting fails', async () => {
    state.recordShouldThrow = true
    const app = makeApp(state)
    const res = await app.request('/auth/github/app/callback?installation_id=8675309')
    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('error=persist_failed')
  })
})

describe('GET /auth/github/app/callback — state-bearing CLI handoff', () => {
  test('with a valid state: mints apiKey, persists hash, redirects to loopback', async () => {
    const { createMemoryInstallHandoffStore } = await import('../src/github/install-handoff-memory-store')
    const handoffStore = createMemoryInstallHandoffStore({
      now: () => 1_700_000_000_000,
      ttlMs: 5 * 60_000,
    })
    const stateNonce = 'a'.repeat(48)
    handoffStore.start({ state: stateNonce, redirectUri: 'http://127.0.0.1:49281/install-cb' })

    const minted = { plaintext: 'plaintext-key-1', hash: 'fakehash' }
    const fixedNow = new Date('2026-05-15T00:00:00Z')

    const deps: Partial<GithubAppCallbackDeps> = {
      loadAppCredentials: () => state.loadCredsResult,
      mintJwt: async () => 'fake-jwt-token',
      fetchInstallationMetadata: async () => state.metadataResponse,
      recordInstallation: async (input) => {
        state.recordedInstallations.push(input)
        return input
      },
      resolveOrgId: () => 'Athrean',
      frontendUrl: () => 'http://localhost:3000',
      handoffStore,
      mintApiKey: () => minted,
      now: () => fixedNow,
    }
    const app = new Hono()
    app.route('/auth/github/app', createGithubAppRouter(deps))
    const res = await app.request(
      `/auth/github/app/callback?installation_id=8675309&setup_action=update&state=${stateNonce}`,
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toStartWith('http://127.0.0.1:49281/install-cb?')
    expect(location).toContain('orgId=Athrean')
    expect(location).toContain('installationId=8675309')
    expect(location).toContain('apiKey=plaintext-key-1')

    expect(state.recordedInstallations.length).toBe(1)
    expect(state.recordedInstallations[0].apiKeyHash).toBe('fakehash')
    expect(state.recordedInstallations[0].apiKeyIssuedAt).toBe(fixedNow)

    const completed = handoffStore.get(stateNonce)
    expect(completed?.status).toBe('complete')
    expect(completed?.result?.apiKey).toBe('plaintext-key-1')
  })

  test('with an unknown state: falls back to dashboard error redirect (no plaintext leak)', async () => {
    const { createMemoryInstallHandoffStore } = await import('../src/github/install-handoff-memory-store')
    const handoffStore = createMemoryInstallHandoffStore({
      now: () => 1_700_000_000_000,
      ttlMs: 5 * 60_000,
    })
    const deps: Partial<GithubAppCallbackDeps> = {
      loadAppCredentials: () => state.loadCredsResult,
      mintJwt: async () => 'fake-jwt-token',
      fetchInstallationMetadata: async () => state.metadataResponse,
      recordInstallation: async (input) => {
        state.recordedInstallations.push(input)
        return input
      },
      resolveOrgId: () => 'Athrean',
      frontendUrl: () => 'http://localhost:3000',
      handoffStore,
      mintApiKey: () => ({ plaintext: 'should-not-leak', hash: 'h' }),
      now: () => new Date(),
    }
    const app = new Hono()
    app.route('/auth/github/app', createGithubAppRouter(deps))
    const res = await app.request(`/auth/github/app/callback?installation_id=8675309&state=${'z'.repeat(48)}`)

    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/dashboard/integrations')
    expect(location).toContain('error=invalid_state')
    expect(location).not.toContain('should-not-leak')
    expect(state.recordedInstallations.length).toBe(0)
  })

  test('with state + persist failure: redirects to loopback with ?error= (not dashboard)', async () => {
    const { createMemoryInstallHandoffStore } = await import('../src/github/install-handoff-memory-store')
    const handoffStore = createMemoryInstallHandoffStore({
      now: () => 1_700_000_000_000,
      ttlMs: 5 * 60_000,
    })
    const stateNonce = 'b'.repeat(48)
    handoffStore.start({ state: stateNonce, redirectUri: 'http://127.0.0.1:50000/install-cb' })

    const deps: Partial<GithubAppCallbackDeps> = {
      loadAppCredentials: () => state.loadCredsResult,
      mintJwt: async () => 'fake-jwt-token',
      fetchInstallationMetadata: async () => state.metadataResponse,
      recordInstallation: async () => {
        throw new Error('boom')
      },
      resolveOrgId: () => 'Athrean',
      frontendUrl: () => 'http://localhost:3000',
      handoffStore,
      mintApiKey: () => ({ plaintext: 'p', hash: 'h' }),
      now: () => new Date(),
    }
    const app = new Hono()
    app.route('/auth/github/app', createGithubAppRouter(deps))
    const res = await app.request(`/auth/github/app/callback?installation_id=8675309&state=${stateNonce}`)

    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toStartWith('http://127.0.0.1:50000/install-cb?')
    expect(location).toContain('error=persist_failed')
  })
})
