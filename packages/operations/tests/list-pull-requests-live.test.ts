import { describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { listPullRequestsOperation } from '../src/ops/github/list-pull-requests'
import { buildAppOctokit, loadAppCredentialsFromEnv } from '../../../apps/server/src/github/octokit-app'
import type { OperationContext } from '../src'

// Live integration test — gated behind GITHUB_APP_LIVE=1.
// Verifies list_pull_requests parses what GitHub actually returns for a
// state:'all' query with a tight perPage. Smoke-checks the schema; does
// NOT mutate.
const liveEnabled = process.env.GITHUB_APP_LIVE === '1'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

describe.skipIf(!liveEnabled)('list_pull_requests live integration', () => {
  test('returns recent PRs for Athrean/Orchentra via App-auth Octokit', async () => {
    const creds = loadAppCredentialsFromEnv()
    expect(creds).not.toBeNull()
    expect(creds!.installationId).toBeDefined()

    setGithubAdapter(buildAppOctokit(creds!) as unknown as GithubAdapter)
    setRepoMonitoredCheck(async (fullName) => fullName.toLowerCase() === 'athrean/orchentra')

    const result = (await listPullRequestsOperation.handler(localCtx, {
      owner: 'Athrean',
      repo: 'Orchentra',
      state: 'all',
      perPage: 3,
    })) as { prs: Array<{ number: number; title: string; state: string }>; error?: string }

    if ('error' in result && result.error) {
      throw new Error(`live list_pull_requests returned error: ${result.error}`)
    }
    expect(Array.isArray(result.prs)).toBe(true)
    expect(result.prs.length).toBeGreaterThan(0)
    expect(result.prs.length).toBeLessThanOrEqual(3)

    const first = result.prs[0]
    expect(typeof first.number).toBe('number')
    expect(typeof first.title).toBe('string')
    expect(['open', 'closed']).toContain(first.state)
  })
})
