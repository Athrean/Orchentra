import { describe, expect, test, beforeEach } from 'bun:test'
import {
  handleInstallationEvent,
  handleInstallationRepositoriesEvent,
  InstallationPayloadSchema,
  InstallationRepositoriesPayloadSchema,
  resolveOrgIdForInstallation,
} from '../src/github/installation-handlers'
import { getInstallationByOrg, resetInstallationsStoreForTests } from '../src/github/installations'

beforeEach(() => {
  resetInstallationsStoreForTests()
})

function makeInstallationPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    action: 'created',
    installation: {
      id: 12345,
      account: { login: 'Athrean', id: 999, type: 'Organization' },
      repository_selection: 'selected',
      permissions: { contents: 'read', metadata: 'read' },
      events: ['workflow_run', 'pull_request'],
    },
    ...overrides,
  }
}

describe('InstallationPayloadSchema', () => {
  test('parses a created event', () => {
    const parsed = InstallationPayloadSchema.safeParse(makeInstallationPayload())
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.action).toBe('created')
      expect(parsed.data.installation.id).toBe(12345)
    }
  })

  test('rejects unknown actions', () => {
    const parsed = InstallationPayloadSchema.safeParse(makeInstallationPayload({ action: 'frobnicate' }))
    expect(parsed.success).toBe(false)
  })
})

describe('handleInstallationEvent', () => {
  test('records installation on action=created', async () => {
    const payload = InstallationPayloadSchema.parse(makeInstallationPayload())
    await handleInstallationEvent(payload)
    const orgId = resolveOrgIdForInstallation(payload.installation.id)
    const record = await getInstallationByOrg(orgId)
    expect(record).not.toBeNull()
    expect(record!.installationId).toBe(12345)
    expect(record!.account.login).toBe('Athrean')
    expect(record!.repositorySelection).toBe('selected')
    expect(record!.suspendedAt).toBeNull()
  })

  test('soft-deletes (suspends) installation on action=deleted', async () => {
    // Pre-record the installation so we have something to suspend.
    const created = InstallationPayloadSchema.parse(makeInstallationPayload())
    await handleInstallationEvent(created)

    const deleted = InstallationPayloadSchema.parse(makeInstallationPayload({ action: 'deleted' }))
    await handleInstallationEvent(deleted)

    const orgId = resolveOrgIdForInstallation(created.installation.id)
    const record = await getInstallationByOrg(orgId)
    expect(record).not.toBeNull()
    expect(record!.suspendedAt).toBeInstanceOf(Date)
  })
})

describe('InstallationRepositoriesPayloadSchema', () => {
  test('parses an added event', () => {
    const parsed = InstallationRepositoriesPayloadSchema.safeParse({
      action: 'added',
      installation: {
        id: 4242,
        account: { login: 'Athrean', id: 1, type: 'Organization' },
        repository_selection: 'all',
        permissions: { contents: 'write' },
        events: ['workflow_run'],
      },
    })
    expect(parsed.success).toBe(true)
  })
})

describe('handleInstallationRepositoriesEvent', () => {
  test('updates repository_selection + permissions for the installation', async () => {
    // Seed
    await handleInstallationEvent(InstallationPayloadSchema.parse(makeInstallationPayload()))

    const updated = InstallationRepositoriesPayloadSchema.parse({
      action: 'added',
      installation: {
        id: 12345,
        account: { login: 'Athrean', id: 999, type: 'Organization' },
        repository_selection: 'all',
        permissions: { contents: 'write', metadata: 'read', issues: 'write' },
        events: ['workflow_run', 'pull_request', 'installation_repositories'],
      },
    })
    await handleInstallationRepositoriesEvent(updated)

    const orgId = resolveOrgIdForInstallation(12345)
    const record = await getInstallationByOrg(orgId)
    expect(record).not.toBeNull()
    expect(record!.repositorySelection).toBe('all')
    expect(record!.permissions.contents).toBe('write')
    expect(record!.permissions.issues).toBe('write')
    expect(record!.events).toContain('installation_repositories')
  })
})
