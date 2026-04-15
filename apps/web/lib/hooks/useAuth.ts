'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { queryKeys } from '../queryKeys'
import type { User, Org } from '../types'

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api<{ user: User | null; org: Org | null }>('/api/me'),
  })
}

export function getOrgIdFromCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)orchentra_org_id=([^;]*)/)
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return undefined
  }
}

export function useOrgId(): string | undefined {
  const cookieOrgId = getOrgIdFromCookie()
  const { data } = useMe()
  return cookieOrgId ?? data?.org?.id ?? undefined
}
