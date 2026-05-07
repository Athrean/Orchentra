import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '@orchentra/operations'
import { envList, envSync, parseEnvFile } from '../src/composites/env'

interface SetCall {
  secret_name: string
  value: string
}

function buildFake(): { adapter: GithubAdapter; sets: SetCall[] } {
  const sets: SetCall[] = []
  const adapter = {
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
      setRepoSecret: async (params) => {
        sets.push(params)
      },
    },
  } as unknown as GithubAdapter
  return { adapter, sets }
}

describe('parseEnvFile', () => {
  test('parses KEY=VALUE, comments, blank lines, quoted values', () => {
    const text = [
      '# top-level comment',
      'STRIPE_KEY=sk_test_1234',
      'DB_URL="postgres://localhost/db"',
      '',
      "TOKEN='abc=xyz'",
      'EMPTY=',
    ].join('\n')

    const entries = parseEnvFile(text)
    expect(entries).toContainEqual(['STRIPE_KEY', 'sk_test_1234'])
    expect(entries).toContainEqual(['DB_URL', 'postgres://localhost/db'])
    expect(entries).toContainEqual(['TOKEN', 'abc=xyz'])
    // EMPTY= should still register as a key with empty value
    expect(entries.some(([k]) => k === 'EMPTY')).toBe(true)
  })
})

describe('/env list', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async () => true)
  })

  test('returns names + updated_at without exposing values', async () => {
    const { adapter } = buildFake()
    setGithubAdapter(adapter)

    const result = (await envList('my-org', 'api')) as { secrets: Array<{ name: string; updatedAt: string }> }
    expect(result.secrets.map((s) => s.name).sort()).toEqual(['DB_URL', 'STRIPE_KEY'])
    for (const s of result.secrets) {
      expect((s as Record<string, unknown>).value).toBeUndefined()
    }
  })
})

describe('/env sync', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async () => true)
  })

  test('writes every parsed key after approval; single approval covers the batch', async () => {
    const { adapter, sets } = buildFake()
    setGithubAdapter(adapter)

    let approveCalls = 0
    const result = await envSync({
      owner: 'my-org',
      repo: 'api',
      envFileText: 'KEY1=v1\nKEY2=v2\nKEY3=v3\n',
      approve: async (names) => {
        approveCalls++
        expect(names).toEqual(['KEY1', 'KEY2', 'KEY3'])
        return true
      },
    })

    expect(approveCalls).toBe(1)
    expect(result.synced).toEqual(['KEY1', 'KEY2', 'KEY3'])
    expect(sets.map((s) => s.secret_name)).toEqual(['KEY1', 'KEY2', 'KEY3'])
  })

  test('approval denial writes nothing', async () => {
    const { adapter, sets } = buildFake()
    setGithubAdapter(adapter)

    const result = await envSync({
      owner: 'my-org',
      repo: 'api',
      envFileText: 'KEY1=v1\n',
      approve: async () => false,
    })

    expect(result.synced).toEqual([])
    expect(sets).toEqual([])
    expect(result.skipped).toContain('approval denied')
  })
})
