import { describe, expect, test } from 'bun:test'
import type { RepoSubscription } from '../lib/db/schema'
import { selectScopedSubscriptions } from '../lib/ai/tools'

const base = {
  id: 'sub',
  userId: 'user',
  installationId: 1,
  repoId: 1,
  enabled: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
} satisfies Omit<RepoSubscription, 'repoFullName'>

function sub(repoFullName: string, installationId = 1): RepoSubscription {
  return { ...base, id: repoFullName, repoFullName, installationId }
}

describe('selectScopedSubscriptions', () => {
  const repos = [sub('acme/api'), sub('acme/web'), sub('other/worker', 2)]

  test('returns all repos for all-repos scope', () => {
    expect(selectScopedSubscriptions(repos, 'all-repos').map((repo) => repo.repoFullName)).toEqual([
      'acme/api',
      'acme/web',
      'other/worker',
    ])
  })

  test('filters by selected scope case-insensitively', () => {
    expect(selectScopedSubscriptions(repos, 'ACME/API').map((repo) => repo.repoFullName)).toEqual(['acme/api'])
  })

  test('requested repo cannot escape selected scope', () => {
    expect(selectScopedSubscriptions(repos, 'acme/api', 'acme/web')).toEqual([])
  })
})
