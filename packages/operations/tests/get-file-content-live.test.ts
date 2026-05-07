import { describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { getFileContentOperation } from '../src/ops/github/get-file-content'
import { buildAppOctokit, loadAppCredentialsFromEnv } from '../../../apps/server/src/github/octokit-app'
import type { OperationContext } from '../src'

// Live integration test — gated on GITHUB_APP_LIVE=1.
// Verifies get_file_content against Athrean/Orchentra README.md (stable file).
const liveEnabled = process.env.GITHUB_APP_LIVE === '1'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

describe.skipIf(!liveEnabled)('get_file_content live integration', () => {
  test('reads README.md from the repo via App-auth Octokit', async () => {
    const creds = loadAppCredentialsFromEnv()
    expect(creds).not.toBeNull()
    setGithubAdapter(buildAppOctokit(creds!) as unknown as GithubAdapter)
    setRepoMonitoredCheck(async (full) => full.toLowerCase() === 'athrean/orchentra')

    const result = (await getFileContentOperation.handler(localCtx, {
      owner: 'Athrean',
      repo: 'Orchentra',
      path: 'README.md',
    })) as { content?: string; error?: string }

    if ('error' in result && result.error) throw new Error(`live get_file_content: ${result.error}`)
    expect(typeof result.content).toBe('string')
    expect(result.content!.length).toBeGreaterThan(0)
  })
})
