import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createMemoryInstallationStore } from '../src/github/installations-memory-store'
import { recordInstallation, setInstallationStoreForTesting, type InstallationStore } from '../src/github/installations'
import { createInstallationsRouter } from '../src/routes/installations'

let store: InstallationStore
let app: Hono

beforeEach(() => {
  store = createMemoryInstallationStore()
  setInstallationStoreForTesting(store)
  app = new Hono()
  app.route('/api/installations', createInstallationsRouter())
})

afterEach(() => {
  setInstallationStoreForTesting(null)
})

afterAll(() => {
  setInstallationStoreForTesting(null)
})

async function seed(orgId: string, opts: { suspendedAt?: Date } = {}): Promise<void> {
  await recordInstallation({
    installationId: 8675309,
    orgId,
    account: { login: orgId, type: 'Organization' },
    repositorySelection: 'selected',
    permissions: {},
    events: [],
    suspendedAt: opts.suspendedAt ?? null,
  })
}

describe('GET /api/installations/by-owner/:owner', () => {
  test('returns 200 with orgId, installationId, installedAt when installed', async () => {
    await seed('Athrean')
    const res = await app.request('/api/installations/by-owner/Athrean')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      orgId: string
      installationId: number
      installedAt: string
      suspendedAt: string | null
    }
    expect(body.orgId).toBe('Athrean')
    expect(body.installationId).toBe(8675309)
    expect(typeof body.installedAt).toBe('string')
    expect(body.suspendedAt).toBeNull()
  })

  test('returns 404 not_installed when no install exists for the owner', async () => {
    const res = await app.request('/api/installations/by-owner/NotInstalled')
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_installed')
  })

  test('surfaces suspendedAt when the installation is suspended', async () => {
    const suspendedAt = new Date('2026-05-10T00:00:00Z')
    await seed('SuspendedOrg', { suspendedAt })
    const res = await app.request('/api/installations/by-owner/SuspendedOrg')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { suspendedAt: string }
    expect(body.suspendedAt).toBe(suspendedAt.toISOString())
  })

  test('owner lookup is case-insensitive', async () => {
    await seed('Athrean')
    const res = await app.request('/api/installations/by-owner/athrean')
    expect(res.status).toBe(200)
    expect((await res.json()).orgId).toBe('Athrean')
  })

  test('rejects a malformed owner (chars/length) with 400', async () => {
    const cases = ['owner_with_underscore', 'owner.with.dot', 'a'.repeat(40)]
    for (const owner of cases) {
      const res = await app.request(`/api/installations/by-owner/${owner}`)
      expect(res.status).toBe(400)
    }
  })
})
