'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from '../queryKeys'
import type { Analytics } from '../types'
import { useOrgId } from './useAuth'

/**
 * Fetch aggregated CI/CD health metrics.
 * Defaults to the last 30 days if from/to are not provided.
 */
export function useAnalytics(repo: string, from?: string, to?: string) {
  const orgId = useOrgId()
  const toStr = to ?? new Date().toISOString().slice(0, 10)
  const fromStr = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return useQuery({
    queryKey: orgId ? queryKeys.analytics(orgId, repo, fromStr, toStr) : ['analytics', repo],
    queryFn: () => {
      const params = new URLSearchParams({ from: fromStr, to: toStr })
      if (repo) params.set('repo', repo)
      return api<Analytics>(`/api/orgs/${orgId}/analytics?${params}`)
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
}
