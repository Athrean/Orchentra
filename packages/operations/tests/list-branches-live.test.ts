import { describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { listBranchesOperation } from '../src/ops/github/list-branches'
import { buildAppOctokit, loadAppCredentialsFromEnv } from '../../../apps/server/src/github/octokit-app'
import type { OperationContext } from '../src'

// Live integration test — gated behind GITHUB_APP_LIVE=1.
// Verifies list_branches against the real Athrean/Orchentra repo. The
// repo always has at least `main`, so this is a stable smoke check.
const liveEnabled = process.env.GITHUB_APP_LIVE === '1'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

describe.skipIf(!liveEnabled)('list_branches live integration', () => {
  test('returns branches for Athrean/Orchentra including main', async () => {
    const creds = loadAppCredentialsFromEnv()
    expect(creds).not.toBeNull()
    expect(creds!.installationId).toBeDefined()

    setGithubAdapter(buildAppOctokit(creds!) as unknown as GithubAdapter)
    setRepoMonitoredCheck(async (fullName) => fullName.toLowerCase() === 'athrean/orchentra')

    const result = (await listBranchesOperation.handler(localCtx, {
      owner: 'Athrean',
      repo: 'Orchentra',
      perPage: 100,
    })) as { branches: Array<{ name: string; protected: boolean; sha: string }>; error?: string }

    if ('error' in result && result.error) {
      throw new Error(`live list_branches returned error: ${result.error}`)
    }
    expect(Array.isArray(result.branches)).toBe(true)
    expect(result.branches.length).toBeGreaterThan(0)

    const branchNames = result.branches.map((b) => b.name)
    expect(branchNames).toContain('main')

    const main = result.branches.find((b) => b.name === 'main')!
    expect(typeof main.protected).toBe('boolean')
    expect(typeof main.sha).toBe('string')
    expect(main.sha.length).toBeGreaterThan(6)
  })
})
