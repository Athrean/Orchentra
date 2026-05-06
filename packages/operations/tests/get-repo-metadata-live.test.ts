import { describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { getRepoMetadataOperation } from '../src/ops/github/get-repo-metadata'
import { buildAppOctokit, loadAppCredentialsFromEnv } from '../../../apps/server/src/github/octokit-app'
import type { OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

// Live integration test — gated behind GITHUB_APP_LIVE=1 so CI without real
// App credentials skips it. Verifies that get_repo_metadata composes
// repos.get + repos.listLanguages + repos.getAllTopics correctly through an
// install-scoped Octokit against the actual Athrean/Orchentra repository.
const liveEnabled = process.env.GITHUB_APP_LIVE === '1'

describe.skipIf(!liveEnabled)('get_repo_metadata live integration', () => {
  test('App-auth Octokit returns Orchentra metadata with private=true', async () => {
    const creds = loadAppCredentialsFromEnv()
    expect(creds).not.toBeNull()
    expect(creds!.installationId).toBeDefined()

    setGithubAdapter(buildAppOctokit(creds!) as unknown as GithubAdapter)
    setRepoMonitoredCheck(async () => true)

    const result = (await getRepoMetadataOperation.handler(localCtx, {
      owner: 'Athrean',
      repo: 'Orchentra',
    })) as { name: string; fullName: string; private: boolean; defaultBranch: string }

    expect(result.name).toBe('Orchentra')
    expect(result.fullName).toBe('Athrean/Orchentra')
    expect(result.private).toBe(true)
    expect(result.defaultBranch).toBeDefined()
  })
})
