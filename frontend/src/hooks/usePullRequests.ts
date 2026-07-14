import { useAsync } from '@/hooks/useAsync'
import { getPullRequests } from '@/services/api/client'
import type { PRsResponse } from '@/types/api'

export function usePullRequests() {
  return useAsync<PRsResponse>(() => getPullRequests())
}
