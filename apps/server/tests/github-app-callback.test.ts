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
