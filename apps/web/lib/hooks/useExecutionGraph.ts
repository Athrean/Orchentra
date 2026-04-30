'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from '../queryKeys'
import type { ExecutionGraph } from '../types'
import { useOrgId } from './useAuth'

export function useExecutionGraph(executionId: string | null) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId && executionId ? queryKeys.executionGraph(orgId, executionId) : ['execution-graph', executionId],
    queryFn: () => api<ExecutionGraph>(`/api/orgs/${orgId}/executions/${executionId}/graph`),
    enabled: !!orgId && !!executionId,
    // Mirrors useIncidents: 5-minute polling as a safety net.
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  })
}
