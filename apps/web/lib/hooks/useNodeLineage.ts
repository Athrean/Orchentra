'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from '../queryKeys'
import type { NodeLineage } from '../types'
import { useOrgId } from './useAuth'

export function useNodeLineage(nodeId: string | null) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: orgId && nodeId ? queryKeys.nodeLineage(orgId, nodeId) : ['node-lineage', nodeId],
    queryFn: () => api<NodeLineage>(`/api/orgs/${orgId}/nodes/${nodeId}/lineage`),
    enabled: !!orgId && !!nodeId,
    // Mirrors useExecutionGraph: 5-minute polling as a safety net.
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  })
}
