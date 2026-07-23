import { useAsync } from '@/hooks/useAsync'
import { getGraph } from '@/services/api/client'
import type { GraphResponse } from '@/types/api'

/**
 * Was previously a bespoke effect+state hook that duplicated useAsync's
 * loading/error logic without its cancellation guard (a slow request could
 * call setState after the Graph page unmounted). Now just useAsync like
 * every other page-level hook (useRepos, useVendors, etc).
 */
export function useGraph() {
  return useAsync<GraphResponse>(() => getGraph())
}
