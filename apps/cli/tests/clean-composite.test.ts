import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '@orchentra/operations'
import { clean } from '../src/composites/clean'

interface DeleteCall {
  artifact_id: number
}

function buildFake(): { adapter: GithubAdapter; deletes: DeleteCall[] } {
  const deletes: DeleteCall[] = []
  const adapter = {
    actions: {
      listWorkflowRunsForRepo: async () => ({
        data: {
          total_count: 2,
          workflow_runs: [
            // Old + failure: candidate.
            {
              id: 1,
              name: 'CI',
              head_branch: 'main',
              head_sha: 'a'.repeat(40),
              status: 'completed',
              conclusion: 'failure',
              run_attempt: 1,
              html_url: 'https://x/1',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-02T00:00:00Z', // long ago
              jobs_url: '',
              logs_url: '',
            },
            // Recent + success: not a candidate.
            {
              id: 2,
              name: 'CI',
              head_branch: 'main',
              head_sha: 'b'.repeat(40),
              status: 'completed',
              conclusion: 'success',
              run_attempt: 1,
              html_url: 'https://x/2',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              jobs_url: '',
              logs_url: '',
            },
          ],
        },
      }),
      listWorkflowRunArtifacts: async ({ run_id }) => ({
        data: {
          total_count: run_id === 1 ? 2 : 0,
          artifacts:
            run_id === 1
              ? [
                  {
                    id: 100,
                    name: 'logs',
                    size_in_bytes: 5000,
                    expired: true,
                    archive_download_url: 'https://x/100',
                  },
                  {
                    id: 101,
                    name: 'still-fresh',
                    size_in_bytes: 500,
                    expired: false,
                    archive_download_url: 'https://x/101',
                  },
                ]
              : [],
        },
      }),
      deleteArtifact: async ({ artifact_id }) => {
        deletes.push({ artifact_id })
      },
    },
  } as unknown as GithubAdapter
  return { adapter, deletes }
}

describe('/clean composite', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async () => true)
  })

  test('dry-run lists candidates without calling deleteArtifact', async () => {
    const { adapter, deletes } = buildFake()
    setGithubAdapter(adapter)

    const result = await clean({
      owner: 'my-org',
      repo: 'api',
      dryRun: true,
      approve: async () => true,
    })

    expect(result.summary.expiredArtifacts).toHaveLength(1)
    expect(result.summary.expiredArtifacts[0].id).toBe(100)
    expect(result.deleted).toEqual([])
    expect(deletes).toEqual([])
  })

  test('on approval, deletes only expired artifacts and reports them', async () => {
    const { adapter, deletes } = buildFake()
    setGithubAdapter(adapter)

    const result = await clean({
      owner: 'my-org',
      repo: 'api',
      approve: async () => true,
    })

    expect(result.deleted).toEqual([100])
    expect(deletes).toEqual([{ artifact_id: 100 }])
  })

  test('approval denial skips all destructive actions', async () => {
    const { adapter, deletes } = buildFake()
    setGithubAdapter(adapter)

    const result = await clean({
      owner: 'my-org',
      repo: 'api',
      approve: async () => false,
    })

    expect(result.deleted).toEqual([])
    expect(deletes).toEqual([])
    expect(result.skipped).toContain('approval denied')
  })

  test('approve callback receives the candidate summary so user sees what is about to delete', async () => {
    const { adapter } = buildFake()
    setGithubAdapter(adapter)

    let captured: unknown
    await clean({
      owner: 'my-org',
      repo: 'api',
      approve: async (summary) => {
        captured = summary
        return true
      },
    })
    expect(captured).toBeDefined()
    const s = captured as { expiredArtifacts: Array<{ id: number }>; totalSizeBytes: number }
    expect(s.expiredArtifacts.map((a) => a.id)).toEqual([100])
    expect(s.totalSizeBytes).toBe(5000)
  })
})
