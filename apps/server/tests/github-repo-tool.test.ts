import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { spawnFakeGitHub } from './fakes/github-server'
import { makeFakeOctokit } from './helpers/fake-octokit'

const fake = await spawnFakeGitHub()

mock.module('../src/config', () => ({
  config: {
    github: {
      token: 'ghp_test',
      webhook_secret: 'test',
      api_base_url: fake.baseUrl,
      repos: ['my-org/api'],
    },
  },
}))

const monitoredSet = new Set(['my-org/api'])
mock.module('../src/lib/repo-cache', () => ({
  isRepoMonitored: async (fullName: string) => monitoredSet.has(fullName.toLowerCase()),
  getMonitoredRepos: async () => monitoredSet,
  invalidateMonitoredReposCache: () => {},
}))

const { setOctokitForTesting } = await import('../src/github/octokit')
const { getCommitChangesTool, getFileContentTool } = await import('../src/agent/tools/github-repo')

setOctokitForTesting(makeFakeOctokit(fake.baseUrl) as never)

afterAll(async () => {
  await fake.shutdown()
})

const ctx = { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }

beforeEach(() => {
  fake.requests.length = 0
  fake.setScenario({})
})

describe('getCommitChangesTool', () => {
  test('returns parsed commit + file diff (happy path)', async () => {
    fake.setScenario({
      routes: {
        'GET /repos/:owner/:repo/commits/:sha': (c) =>
          c.json({
            sha: 'abc1234',
            commit: { message: 'fix: handle null user', author: { name: 'Dev' } },
            files: [
              {
                filename: 'src/auth.ts',
                status: 'modified',
                additions: 4,
                deletions: 1,
                patch: '@@ -1,3 +1,4 @@\n+null check',
              },
            ],
          }),
      },
    })

    const result = await getCommitChangesTool.execute({ owner: 'my-org', repo: 'api', sha: 'abc1234' }, ctx)

    expect(result.sha).toBe('abc1234')
    expect(result.message).toBe('fix: handle null user')
    expect(result.author).toBe('Dev')
    expect(result.files).toHaveLength(1)
    expect(result.files[0].filename).toBe('src/auth.ts')
  })

  test('returns error on API failure', async () => {
    fake.setScenario({
      routes: {
        'GET /repos/:owner/:repo/commits/:sha': (c) => c.json({ message: 'Not Found' }, 404),
      },
    })

    const result = await getCommitChangesTool.execute({ owner: 'my-org', repo: 'api', sha: 'deadbeef' }, ctx)
    expect(result).toHaveProperty('error')
    expect(result.error).toContain('Failed to fetch commit')
  })

  test('rejects unmonitored repos', async () => {
    const result = await getCommitChangesTool.execute({ owner: 'evil', repo: 'corp', sha: 'abc' }, ctx)
    expect(result).toHaveProperty('error')
  })
})

describe('getFileContentTool', () => {
  test('returns decoded file content (happy path)', async () => {
    fake.setScenario({
      routes: {
        'GET /repos/:owner/:repo/contents/:path{.+}': (c) =>
          c.json({
            type: 'file',
            path: '.github/workflows/ci.yml',
            content: Buffer.from('name: CI\non: push\n').toString('base64'),
            size: 18,
          }),
      },
    })

    const result = await getFileContentTool.execute(
      { owner: 'my-org', repo: 'api', path: '.github/workflows/ci.yml' },
      ctx,
    )

    expect(result.path).toBe('.github/workflows/ci.yml')
    expect(result.content).toContain('name: CI')
    expect(result.truncated).toBe(false)
  })

  test('returns error on API failure', async () => {
    fake.setScenario({
      routes: {
        'GET /repos/:owner/:repo/contents/:path{.+}': (c) => c.json({ message: 'Not Found' }, 404),
      },
    })

    const result = await getFileContentTool.execute({ owner: 'my-org', repo: 'api', path: 'missing.txt' }, ctx)
    expect(result).toHaveProperty('error')
    expect(result.error).toContain('Failed to fetch file')
  })

  test('rejects unmonitored repos', async () => {
    const result = await getFileContentTool.execute({ owner: 'evil', repo: 'corp', path: 'foo.txt' }, ctx)
    expect(result).toHaveProperty('error')
  })
})
