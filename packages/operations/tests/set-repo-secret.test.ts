import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import {
  setRepoSecretOperation,
  type SetRepoSecretError,
  type SetRepoSecretResult,
} from '../src/ops/github/set-repo-secret'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface CapturedSet {
  owner: string
  repo: string
  secret_name: string
  value: string
}

function buildFake(): { adapter: GithubAdapter; calls: CapturedSet[] } {
  const calls: CapturedSet[] = []
  const adapter = {
    actions: {
      setRepoSecret: async (params) => {
        calls.push(params)
      },
    },
  } as unknown as GithubAdapter
  return { adapter, calls }
}

describe('set_repo_secret operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (full) => full === 'my-org/api')
  })

  test('handler forwards the value to the adapter for encryption', async () => {
    const { adapter, calls } = buildFake()
    setGithubAdapter(adapter)

    const result = (await setRepoSecretOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      secretName: 'STRIPE_KEY',
      value: 'sk_test_1234',
    })) as SetRepoSecretResult

    expect(result).toEqual({ ok: true, secretName: 'STRIPE_KEY' })
    expect(calls).toEqual([{ owner: 'my-org', repo: 'api', secret_name: 'STRIPE_KEY', value: 'sk_test_1234' }])
  })

  test('rejects invalid secret names (must match GitHub rules)', async () => {
    const { adapter } = buildFake()
    setGithubAdapter(adapter)

    let captured: unknown
    try {
      await dispatch(setRepoSecretOperation, localCtx, {
        owner: 'my-org',
        repo: 'api',
        secretName: 'invalid-name',
        value: 'x',
      })
    } catch (err) {
      captured = err
    }
    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('rejects unmonitored repo', async () => {
    const { adapter } = buildFake()
    setGithubAdapter(adapter)
    const result = (await setRepoSecretOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      secretName: 'KEY',
      value: 'v',
    })) as SetRepoSecretError
    expect(result.error).toContain('not monitored')
  })

  test('declares write scope + mutating', () => {
    expect(setRepoSecretOperation.scope).toBe('write')
    expect(setRepoSecretOperation.trustClass).toBe('write')
    expect(setRepoSecretOperation.mutating).toBe(true)
  })
})
