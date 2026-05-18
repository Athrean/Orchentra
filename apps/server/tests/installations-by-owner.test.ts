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

async function seed(
  orgId: string,
  opts: { suspendedAt?: Date; installationId?: number; accountLogin?: string } = {},
): Promise<void> {
  await recordInstallation({
    installationId: opts.installationId ?? 8675309,
    orgId,
    account: { login: opts.accountLogin ?? orgId, type: 'Organization' },
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

  test('matches on the GitHub account login, not on Orchentra orgId', async () => {
    // orgId is an internal Orchentra identifier; the route receives a GitHub
    // owner login from the CLI. Matching on orgId silently misses real
    // installations whenever the two diverge.
    await seed('internal-abc', { accountLogin: 'Athrean', installationId: 4242 })
    const hit = await app.request('/api/installations/by-owner/Athrean')
    expect(hit.status).toBe(200)
    expect((await hit.json()).installationId).toBe(4242)
    const miss = await app.request('/api/installations/by-owner/internal-abc')
    expect(miss.status).toBe(404)
  })

  test('returns the most recently updated installation when an owner has multiple', async () => {
    await seed('org_old', { accountLogin: 'Athrean', installationId: 1001 })
    await new Promise((r) => setTimeout(r, 5))
    await seed('org_new', { accountLogin: 'Athrean', installationId: 2002 })
    const res = await app.request('/api/installations/by-owner/Athrean')
    expect(res.status).toBe(200)
    expect((await res.json()).installationId).toBe(2002)
  })

  test('rejects a malformed owner (chars/length) with 400', async () => {
    const cases = ['owner_with_underscore', 'owner.with.dot', 'a'.repeat(40)]
    for (const owner of cases) {
      const res = await app.request(`/api/installations/by-owner/${owner}`)
      expect(res.status).toBe(400)
    }
  })
})
