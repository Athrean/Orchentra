'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from '../queryKeys'
import type { Repo, ValidatedRepo } from '../types'
import { useOrgId } from './useAuth'

export function useMonitorRepo() {
  const qc = useQueryClient()
  const orgId = useOrgId()
  return useMutation({
    mutationFn: (repo: string) => {
      if (!orgId) throw new Error('No org')
      return api(`/api/orgs/${orgId}/repos/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      })
    },
    onSuccess: () => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: queryKeys.repos(orgId) })
    },
  })
}

export function useValidateRepo() {
  const orgId = useOrgId()
  return useMutation({
    mutationFn: async (input: string): Promise<{ valid: boolean; repo?: ValidatedRepo }> => {
      if (!orgId) throw new Error('No org')
      // Accept full GitHub URLs too
      const match = input.match(/(?:github\.com\/)?([\w.-]+\/[\w.-]+)/)
      const repo = match?.[1] ?? input
      return api<{ valid: boolean; repo?: ValidatedRepo }>(
        `/api/orgs/${orgId}/repos/validate?repo=${encodeURIComponent(repo)}`,
      )
    },
  })
}

export function useAvailableRepos() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId ? queryKeys.repos(orgId) : ['repos'],
    queryFn: () => api<{ repos: Repo[] }>(`/api/orgs/${orgId}/repos/available`).then((d) => d.repos),
    enabled: !!orgId,
  })
}
