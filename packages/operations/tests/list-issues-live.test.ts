import { describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { listIssuesOperation } from '../src/ops/github/list-issues'
import { buildAppOctokit, loadAppCredentialsFromEnv } from '../../../apps/server/src/github/octokit-app'
import type { OperationContext } from '../src'

const liveEnabled = process.env.GITHUB_APP_LIVE === '1'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

describe.skipIf(!liveEnabled)('list_issues live integration', () => {
  test('lists issues for the repo without crashing on shape', async () => {
    const creds = loadAppCredentialsFromEnv()
    expect(creds).not.toBeNull()
    setGithubAdapter(buildAppOctokit(creds!) as unknown as GithubAdapter)
    setRepoMonitoredCheck(async (full) => full.toLowerCase() === 'athrean/orchentra')

    const result = (await listIssuesOperation.handler(localCtx, {
      owner: 'Athrean',
      repo: 'Orchentra',
      state: 'all',
      perPage: 3,
    })) as { issues: Array<{ number: number; title: string }>; error?: string }

    if ('error' in result && result.error) throw new Error(`live list_issues: ${result.error}`)
    expect(Array.isArray(result.issues)).toBe(true)
    if (result.issues.length > 0) {
      expect(typeof result.issues[0].number).toBe('number')
      expect(typeof result.issues[0].title).toBe('string')
    }
  })
})
