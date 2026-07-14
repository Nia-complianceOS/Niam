import { useAsync } from '@/hooks/useAsync'
import { getRepos } from '@/services/api/client'
import type { ReposResponse } from '@/types/api'

export function useRepos() {
  return useAsync<ReposResponse>(() => getRepos())
}
