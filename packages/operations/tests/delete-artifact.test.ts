import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import {
  deleteArtifactOperation,
  type DeleteArtifactError,
  type DeleteArtifactResult,
} from '../src/ops/github/delete-artifact'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface CapturedDelete {
  owner: string
  repo: string
  artifact_id: number
}

function buildFake(overrides: { deleteArtifact?: GithubAdapter['actions']['deleteArtifact'] } = {}): {
  adapter: GithubAdapter
  calls: CapturedDelete[]
} {
  const calls: CapturedDelete[] = []
  const adapter = {
    actions: {
      deleteArtifact:
        overrides.deleteArtifact ??
        (async (params) => {
          calls.push(params)
        }),
    },
  } as unknown as GithubAdapter
  return { adapter, calls }
}

describe('delete_artifact operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (full) => full === 'my-org/api')
  })

  test('handler deletes and reports ok', async () => {
    const { adapter, calls } = buildFake()
    setGithubAdapter(adapter)

    const result = (await deleteArtifactOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      artifactId: 42,
    })) as DeleteArtifactResult

    expect(result).toEqual({ ok: true })
    expect(calls).toEqual([{ owner: 'my-org', repo: 'api', artifact_id: 42 }])
  })

  test('declares destructive trust class + write scope', () => {
    expect(deleteArtifactOperation.scope).toBe('write')
    expect(deleteArtifactOperation.trustClass).toBe('destructive')
    expect(deleteArtifactOperation.mutating).toBe(true)
  })

  test('rejects unmonitored repo', async () => {
    const { adapter } = buildFake()
    setGithubAdapter(adapter)
    const result = (await deleteArtifactOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      artifactId: 1,
    })) as DeleteArtifactError
    expect(result.error).toContain('not monitored')
  })

  test('dispatch on remote ctx without approval returns permission_denied', async () => {
    const { adapter } = buildFake()
    setGithubAdapter(adapter)
    let captured: unknown
    try {
      await dispatch(
        deleteArtifactOperation,
        { remote: true, allowedScopes: new Set(['read', 'write', 'admin']) },
        { owner: 'my-org', repo: 'api', artifactId: 1 },
      )
    } catch (err) {
      captured = err
    }
    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('permission_denied')
  })
})
