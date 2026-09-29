import { useEffect, useState } from 'react'
import { getReviewCounts, isAbortError } from '@/services/api/client'
import { useDataVersion } from '@/lib/dataEvents'
import { useMyRole } from '@/hooks/useMyRole'
import type { ReviewCounts, WorkspaceRole } from '@/types/api'

/**
 * How many reviews are waiting on the CURRENT USER, for the sidebar badge
 * (which adds `legal + owner`). The part that is not theirs to act on is
 * zeroed here, so the badge means "things you can move":
 *
 *   legal  -> the legal queue only;
 *   owner  -> the owner queue AND the legal queue, because the server lets
 *             an owner act at the legal stage (that is how a one-person
 *             workspace works). In a team with its own legal reviewer this
 *             over-counts slightly for the owner; that is the simple rule,
 *             chosen over guessing who "should" pick it up;
 *   member -> nothing (members draft fixes but cannot review them).
 *
 * While the role is still loading, the raw counts are returned unchanged.
 *
 * Refetches whenever notifyDataChanged() fires and once a minute, since
 * the other reviewer acts from their own browser. A failure (for example
 * before migration 006 is applied) reads as zero, not as an error: a badge
 * is not the place to report an outage.
 */
export function useReviewCounts(): ReviewCounts {
  const counts = useReviewQueueCounts()
  const role = useMyRole()
  return countsForRole(counts, role)
}

/** The workspace's raw queue sizes, whoever is looking (dashboard). */
export function useReviewQueueCounts(): ReviewCounts {
  const version = useDataVersion()
  const [counts, setCounts] = useState<ReviewCounts>({ legal: 0, owner: 0 })

  useEffect(() => {
    let cancelled = false
    const load = () =>
      getReviewCounts()
        .then((c) => {
          if (!cancelled) setCounts(c)
        })
        .catch((err) => {
          if (!cancelled && !isAbortError(err)) setCounts({ legal: 0, owner: 0 })
        })
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [version])

  return counts
}

export function countsForRole(counts: ReviewCounts, role: WorkspaceRole | null): ReviewCounts {
  switch (role) {
    case 'legal':
      return { legal: counts.legal, owner: 0 }
    case 'member':
      return { legal: 0, owner: 0 }
    default:
      return counts
  }
}
