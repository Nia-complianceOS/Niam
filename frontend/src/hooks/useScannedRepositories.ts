import { useAsync } from '@/hooks/useAsync'
import { getScannedRepositories } from '@/services/api/client'
import type { ScannedRepositoriesResponse } from '@/types/api'

/**
 * The repositories this ACCOUNT has scanned — not the repositories that
 * exist on GitHub, which is useRepos. The two lists overlap but neither
 * contains the other: a repository can be scanned and later deleted from
 * GitHub, and most repositories on GitHub have never been scanned.
 *
 * `enabled` is honoured by short-circuiting the fetcher rather than by
 * skipping the effect, so flipping it to true re-runs the request through
 * the same path as any other refetch. The page passes `false` while it is
 * still showing the Connect panel, where this list has nothing to add.
 */
export function useScannedRepositories(enabled: boolean = true) {
  return useAsync<ScannedRepositoriesResponse>(
    () => (enabled ? getScannedRepositories() : Promise.resolve({ repositories: [] })),
    [enabled]
  )
}
