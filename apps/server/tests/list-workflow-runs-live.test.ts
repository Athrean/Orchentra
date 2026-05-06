import { describe, expect, test } from 'bun:test'
import {
  listWorkflowRunsOperation,
  setGithubAdapter,
  setRepoMonitoredCheck,
  type GithubAdapter,
  type ListWorkflowRunsResult,
  type ListWorkflowRunsError,
} from '@orchentra/operations'
import { buildAppOctokit, loadAppCredentialsFromEnv } from '../src/github/octokit-app'

// Live integration test for list_workflow_runs against Athrean/Orchentra.
// Gated by GITHUB_APP_LIVE=1 so CI without real App credentials skips it.
// Reuses the App-auth Octokit pattern from github-app-auth.test.ts so we
// stay aligned with the install-token auth path Slice 1 introduced.
const liveEnabled = process.env.GITHUB_APP_LIVE === '1'

describe.skipIf(!liveEnabled)('list_workflow_runs live integration', () => {
  test('returns recent workflow runs for Athrean/Orchentra via App-auth Octokit', async () => {
    const creds = loadAppCredentialsFromEnv()
    expect(creds).not.toBeNull()
    expect(creds!.installationId).toBeDefined()

    const octokit = buildAppOctokit(creds!)
    setGithubAdapter(octokit as unknown as GithubAdapter)
    setRepoMonitoredCheck(async (fullName) => fullName.toLowerCase() === 'athrean/orchentra')

    const result = (await listWorkflowRunsOperation.handler(
      { remote: false, allowedScopes: new Set(['read']) },
      { owner: 'Athrean', repo: 'Orchentra', perPage: 5 },
    )) as ListWorkflowRunsResult | ListWorkflowRunsError

    if ('error' in result) {
      throw new Error(`live list_workflow_runs returned error: ${result.error}`)
    }

    expect(typeof result.totalCount).toBe('number')
    expect(Array.isArray(result.runs)).toBe(true)
    expect(result.runs.length).toBeGreaterThan(0)
    expect(result.runs.length).toBeLessThanOrEqual(5)

    const first = result.runs[0]
    expect(typeof first.id).toBe('number')
    expect(typeof first.headSha).toBe('string')
    expect(first.headSha.length).toBeGreaterThan(6)
    expect(typeof first.htmlUrl).toBe('string')
    expect(first.htmlUrl.startsWith('https://github.com/Athrean/Orchentra/actions/runs/')).toBe(true)
  })
})
