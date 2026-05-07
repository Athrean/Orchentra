import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import {
  listRepoSecretsOperation,
  type ListRepoSecretsError,
  type ListRepoSecretsResult,
} from '../src/ops/github/list-repo-secrets'
import type { OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

function buildFake(): GithubAdapter {
  return {
    actions: {
      listRepoSecrets: async () => ({
        data: {
          total_count: 2,
          secrets: [
            { name: 'STRIPE_KEY', created_at: '2026-01-01', updated_at: '2026-04-01' },
            { name: 'DB_URL', created_at: '2025-12-01', updated_at: '2026-04-15' },
          ],
        },
      }),
    },
  } as unknown as GithubAdapter
}

describe('list_repo_secrets operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (full) => full === 'my-org/api')
    setGithubAdapter(buildFake())
  })

  test('returns names + timestamps, never values', async () => {
    const result = (await listRepoSecretsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as ListRepoSecretsResult

    expect(result.totalCount).toBe(2)
    expect(result.secrets.map((s) => s.name).sort()).toEqual(['DB_URL', 'STRIPE_KEY'])
    // No `value` field anywhere on the result.
    for (const s of result.secrets) {
      expect((s as Record<string, unknown>).value).toBeUndefined()
      expect((s as Record<string, unknown>).encrypted_value).toBeUndefined()
    }
  })

  test('declares read scope, not mutating', () => {
    expect(listRepoSecretsOperation.scope).toBe('read')
    expect(listRepoSecretsOperation.mutating).toBe(false)
  })

  test('rejects unmonitored repo', async () => {
    const result = (await listRepoSecretsOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
    })) as ListRepoSecretsError
    expect(result.error).toContain('not monitored')
  })
})
