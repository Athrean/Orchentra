import { describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { listCheckRunsOperation } from '../src/ops/github/list-check-runs'
import { buildAppOctokit, loadAppCredentialsFromEnv } from '../../../apps/server/src/github/octokit-app'
import type { OperationContext } from '../src'

const liveEnabled = process.env.GITHUB_APP_LIVE === '1'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

describe.skipIf(!liveEnabled)('list_check_runs live integration', () => {
  test('lists check runs for ref `main` without crashing on shape', async () => {
    const creds = loadAppCredentialsFromEnv()
    expect(creds).not.toBeNull()
    setGithubAdapter(buildAppOctokit(creds!) as unknown as GithubAdapter)
    setRepoMonitoredCheck(async (full) => full.toLowerCase() === 'athrean/orchentra')

    const result = (await listCheckRunsOperation.handler(localCtx, {
      owner: 'Athrean',
      repo: 'Orchentra',
      ref: 'main',
    })) as { total: number; checkRuns: Array<{ id: number; name: string }>; error?: string }

    if ('error' in result && result.error) throw new Error(`live list_check_runs: ${result.error}`)
    expect(typeof result.total).toBe('number')
    expect(Array.isArray(result.checkRuns)).toBe(true)
    if (result.checkRuns.length > 0) {
      expect(typeof result.checkRuns[0].id).toBe('number')
      expect(typeof result.checkRuns[0].name).toBe('string')
    }
  })
})
