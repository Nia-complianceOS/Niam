import { useCallback, useEffect, useMemo, useState } from 'react'
import { generateFix, getGaps, openPR } from '@/services/api/client'
import type { Gap, PullRequest } from '@/types/api'
import { gapMatches, sortGaps } from '@/lib/gapLanguage'

/**
 * Every gap, selectable one at a time.
 *
 * This replaces the dashboard's remediation flow, which could only ever
 * reach ONE gap: it derived the selection from `recent_commits[0].sha` and
 * took the first gap matching it. Every gap in a smoke run shares the same
 * commit, so gaps 2 through 40 were unreachable -- and once that one gap
 * hit `pr_opened` the panel showed "awaiting legal review" with no way
 * back. That looked like a rule against having two pull requests open at
 * once. There was no such rule; there was just no way to select anything
 * else.
 */
export function useGaps() {
  const [gaps, setGaps] = useState<Gap[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fixLoading, setFixLoading] = useState(false)
  const [prLoading, setPrLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [openedPR, setOpenedPR] = useState<PullRequest | null>(null)

  useEffect(() => {
    getGaps()
      .then((data) => setGaps(data.gaps))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Most urgent first. Filtering happens after sorting so the order a
  // person sees never changes as they type.
  const sorted = useMemo(() => sortGaps(gaps), [gaps])
  const visible = useMemo(
    () => sorted.filter((g) => gapMatches(g, query)),
    [sorted, query]
  )

  const selected = useMemo(
    () => gaps.find((g) => g.id === selectedId) ?? null,
    [gaps, selectedId]
  )

  const select = useCallback((id: string) => {
    setActionError(null)
    setSelectedId(id)
  }, [])

  const patch = useCallback((id: string, changes: Partial<Gap>) => {
    setGaps((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...changes } : g))
    )
  }, [])

  const runGenerateFix = useCallback(async () => {
    if (!selected) return
    setFixLoading(true)
    setActionError(null)
    try {
      const result = await generateFix(selected.id)
      patch(selected.id, {
        remediation_drafts: result.remediation_drafts,
        status: 'fix_generated',
      })
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setFixLoading(false)
    }
  }, [selected, patch])

  const runOpenPR = useCallback(async () => {
    if (!selected) return null
    setPrLoading(true)
    setActionError(null)
    try {
      const result = await openPR(selected.id)
      // Only this gap changes. Other gaps keep whatever state they are in,
      // so several can be with legal at the same time.
      patch(selected.id, {
        pr_id: result.pull_request.id,
        status: 'pr_opened',
      })
      setOpenedPR(result.pull_request)
      return result.pull_request
    } catch (err) {
      setActionError((err as Error).message)
      return null
    } finally {
      setPrLoading(false)
    }
  }, [selected, patch])

  return {
    gaps: sorted,
    visible,
    selected,
    selectedId,
    select,
    query,
    setQuery,
    loading,
    error,
    fixLoading,
    prLoading,
    actionError,
    openedPR,
    dismissPR: () => setOpenedPR(null),
    runGenerateFix,
    runOpenPR,
  }
}
