import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { Hono } from 'hono'

// Match webhook.test.ts pattern: mock the dependencies the route imports
// before importing the route module itself.

mock.module('../src/github/octokit-app', () => ({
  loadAppCredentialsFromEnv: () => ({
    appId: 3617072,
    privateKey: '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----',
  }),
}))

mock.module('../src/github/app-jwt', () => ({
  mintAppJwt: async () => 'fake-jwt-token',
}))

let octokitGetCalls: { installation_id: number }[] = []
let octokitShouldThrow = false
let octokitResponseData: Record<string, unknown> = {
  id: 8675309,
  account: { login: 'Athrean', id: 1, type: 'Organization' },
  repository_selection: 'selected',
  permissions: { contents: 'read', metadata: 'read' },
  events: ['workflow_run', 'pull_request'],
}

mock.module('@octokit/rest', () => ({
  Octokit: class {
    constructor(_opts: unknown) {}
    async request(_route: string, params: { installation_id: number }): Promise<{ data: Record<string, unknown> }> {
      octokitGetCalls.push(params)
      if (octokitShouldThrow) throw new Error('boom')
      return { data: octokitResponseData }
    }
  },
}))

mock.module('../src/github/installation-handlers', () => ({
  resolveOrgIdForInstallation: () => 'Athrean',
}))

let recordedInstallations: Record<string, unknown>[] = []
let recordShouldThrow = false
mock.module('../src/github/installations', () => ({
  recordInstallation: async (input: Record<string, unknown>) => {
    if (recordShouldThrow) throw new Error('persist explode')
    recordedInstallations.push(input)
    return input
  },
}))

const { githubAppRouter } = await import('../src/routes/github-app')

function makeApp(): Hono {
  const app = new Hono()
  app.route('/auth/github/app', githubAppRouter)
  return app
}

beforeEach(() => {
  octokitGetCalls = []
  recordedInstallations = []
  octokitShouldThrow = false
  recordShouldThrow = false
  octokitResponseData = {
    id: 8675309,
    account: { login: 'Athrean', id: 1, type: 'Organization' },
    repository_selection: 'selected',
    permissions: { contents: 'read', metadata: 'read' },
    events: ['workflow_run', 'pull_request'],
  }
})

describe('GET /auth/github/app/callback', () => {
  test('happy path: fetches install metadata, persists row, redirects to dashboard', async () => {
    const app = makeApp()
    const res = await app.request('/auth/github/app/callback?installation_id=8675309&setup_action=install')

    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/dashboard/integrations')
    expect(location).toContain('installed=8675309')
    expect(location).toContain('setup_action=install')

    expect(octokitGetCalls.length).toBe(1)
    expect(octokitGetCalls[0].installation_id).toBe(8675309)

    expect(recordedInstallations.length).toBe(1)
    expect(recordedInstallations[0].installationId).toBe(8675309)
    expect(recordedInstallations[0].repositorySelection).toBe('selected')
  })

  test('redirects with error when installation_id is missing', async () => {
    const app = makeApp()
    const res = await app.request('/auth/github/app/callback?setup_action=install')

    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('error=missing_installation_id')
  })

  test('redirects with error when installation_id is non-numeric', async () => {
    const app = makeApp()
    const res = await app.request('/auth/github/app/callback?installation_id=not-a-number')
    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('error=invalid_installation_id')
  })

  test('redirects with error when GH metadata fetch fails', async () => {
    octokitShouldThrow = true
    const app = makeApp()
    const res = await app.request('/auth/github/app/callback?installation_id=8675309')
    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('error=metadata_fetch_failed')
    expect(recordedInstallations.length).toBe(0)
  })

  test('redirects with error when persisting fails', async () => {
    recordShouldThrow = true
    const app = makeApp()
    const res = await app.request('/auth/github/app/callback?installation_id=8675309')
    expect(res.status).toBe(302)
    expect(res.headers.get('location') ?? '').toContain('error=persist_failed')
  })
})
