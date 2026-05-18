/**
 * Bootstrap-minted apiKeys must authenticate against `requireAuth` and
 * pass `requireOrgMember` for the installation's org — otherwise the key
 * the CLI just received is useless against `/api/orgs/:orgId/*`.
 *
 * Strategy: stub the `db/client` module so the existing `api_keys` lookup
 * cleanly returns null, then exercise the middleware end-to-end with a
 * memory-backed installation store seeded with a known apiKeyHash.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { Hono } from 'hono'
import { dbClientMockBase } from './helpers/db-client-mock'

mock.module('../src/db/client', () => dbClientMockBase())

const { requireAuth, requireOrgMember } = await import('../src/auth/middleware')
const { hashApiKey } = await import('../src/auth/session')
const { generateApiKey } = await import('../src/auth/session')
const { recordInstallation, setInstallationStoreForTesting } = await import('../src/github/installations')
const { createMemoryInstallationStore } = await import('../src/github/installations-memory-store')

function buildApp(): Hono {
  const app = new Hono()
  app.use('/api/*', requireAuth)
  app.use('/api/orgs/:orgId/*', requireOrgMember)
  app.get('/api/orgs/:orgId/echo', (c) => c.json({ ok: true, orgId: c.req.param('orgId') }))
  return app
}

beforeEach(() => {
  setInstallationStoreForTesting(createMemoryInstallationStore())
})

afterEach(() => {
  setInstallationStoreForTesting(null)
})

describe('requireAuth — installation-scoped apiKey', () => {
  test('a bootstrap apiKey persisted on github_installations authenticates', async () => {
    const apiKey = generateApiKey()
    await recordInstallation({
      installationId: 9999,
      orgId: 'org-test',
      account: { login: 'Athrean', type: 'Organization' },
      repositorySelection: 'selected',
      permissions: {},
      events: [],
      apiKeyHash: hashApiKey(apiKey),
      apiKeyIssuedAt: new Date(),
    })

    const res = await buildApp().request('/api/orgs/org-test/echo', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).orgId).toBe('org-test')
  })

  test('an installation key for one org cannot reach another org', async () => {
    const apiKey = generateApiKey()
    await recordInstallation({
      installationId: 9999,
      orgId: 'org-test',
      account: { login: 'Athrean', type: 'Organization' },
      repositorySelection: 'selected',
      permissions: {},
      events: [],
      apiKeyHash: hashApiKey(apiKey),
      apiKeyIssuedAt: new Date(),
    })

    const res = await buildApp().request('/api/orgs/other-org/echo', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    expect(res.status).toBe(403)
  })

  test('an unknown apiKey is still rejected', async () => {
    const res = await buildApp().request('/api/orgs/org-test/echo', {
      headers: { Authorization: `Bearer orch_${'0'.repeat(64)}` },
    })
    expect(res.status).toBe(401)
  })
})
