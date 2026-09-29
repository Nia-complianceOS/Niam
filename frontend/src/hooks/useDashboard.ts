import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  generateFix,
  getDashboardSummary,
  getGaps,
  isAbortError,
} from '@/services/api/client'
import type { DashboardSummaryResponse, Gap } from '@/types/api'
import { isClosedGap } from '@/lib/gapLanguage'
import { notifyDataChanged, useDataVersion } from '@/lib/dataEvents'

interface UseDashboardResult {
  summary: DashboardSummaryResponse | null
  gaps: Gap[]
  /**
   * True when this account has nothing at all: no score, because nothing
   * has been mapped, and no findings. The backend sends score: null with a
   * sentence saying why (`scoreExplanation`) rather than a 0 or a 100 --
   * both of which would be assertions about a repository nobody has read.
   * The page shows the on-ramp instead of a dashboard of zeros.
   */
  isEmptyAccount: boolean
  score: number | null
  scoreExplanation: string | null
  selectedCommitSha: string | null
  selectedGap: Gap | undefined
  loading: boolean
  error: string | null
  fixLoading: boolean
  actionError: string | null
  selectCommit: (sha: string) => void
  /** Drafts the fix and sends it to legal review; resolves to the review id. */
  runGenerateFix: () => Promise<string | null>
}

export function useDashboard(): UseDashboardResult {
  const { userId } = useAuth()
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null)
  const [gaps, setGaps] = useState<Gap[]>([])
  const [score, setScore] = useState<number | null>(null)
  const [scoreExplanation, setScoreExplanation] = useState<string | null>(null)
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fixLoading, setFixLoading] = useState(false)

  // Deliberately separate from `error`. `error` means the initial page load
  // (summary + gaps) failed and there's nothing to show — full-page
  // ErrorState in Dashboard.tsx. `actionError` means the page loaded fine
  // but a specific action (drafting a fix) failed — e.g. the gap was
  // already resolved. That should surface inline next to the button that
  // triggered it, not blow away stat cards / timeline / activity feed that
  // are all still perfectly valid.
  const [actionError, setActionError] = useState<string | null>(null)

  // Every reply is checked against this before it is allowed to become
  // state. Signing out aborts the requests, but a reply that was already
  // decoded must not be written into a page that now belongs to somebody
  // else -- so the run number, not just the abort, is the guard.
  const runRef = useRef(0)
  const dataVersion = useDataVersion()
  const loadedForRef = useRef<string | null | undefined>(undefined)
  const refreshRef = useRef(0)

  // Same account, data changed elsewhere (see lib/dataEvents.ts): refetch
  // in place, keeping the selected commit and everything on screen.
  useEffect(() => {
    if (loadedForRef.current !== userId) return
    const run = runRef.current
    const refresh = ++refreshRef.current
    Promise.all([getDashboardSummary(), getGaps()])
      .then(([summaryData, gapsData]) => {
        if (run !== runRef.current || refresh !== refreshRef.current) return
        setSummary(summaryData)
        setGaps(gapsData.gaps)
        setScore(gapsData.score)
        setScoreExplanation(gapsData.score_explanation)
      })
      .catch(() => {
        // Keep what is on screen.
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  useEffect(() => {
    loadedForRef.current = userId
    const run = ++runRef.current
    // Emptied at the start of the run, not when the answer arrives. Left
    // in place, the previous account's stat cards and findings would be on
    // screen for as long as the new account's request takes.
    setSummary(null)
    setGaps([])
    setScore(null)
    setScoreExplanation(null)
    setSelectedCommitSha(null)
    setActionError(null)
    setError(null)
    setLoading(true)

    Promise.all([getDashboardSummary(), getGaps()])
      .then(([summaryData, gapsData]) => {
        if (run !== runRef.current) return
        setSummary(summaryData)
        setGaps(gapsData.gaps)
        setScore(gapsData.score)
        setScoreExplanation(gapsData.score_explanation)
        if (summaryData.recent_commits.length) {
          setSelectedCommitSha(summaryData.recent_commits[0].commit.sha)
        }
      })
      .catch((err: Error) => {
        if (run !== runRef.current || isAbortError(err)) return
        setError(err.message)
      })
      .finally(() => {
        if (run === runRef.current) setLoading(false)
      })
  }, [userId])

  const selectedGap = gaps.find((g) => g.source_commit?.sha === selectedCommitSha)

  const selectCommit = useCallback((sha: string) => {
    // Switching commits should clear any stale action error left over from
    // reviewing a different gap — otherwise a failed "Open PR" on gap A
    // would still show its error banner while looking at unrelated gap B.
    setActionError(null)
    setSelectedCommitSha(sha)
  }, [])

  // There is no "open PR" here any more: a pull request opens only when
  // the owner approves the legal-approved version on /reviews/:id.
  const runGenerateFix = useCallback(async (): Promise<string | null> => {
    if (!selectedGap) return null
    // Defensive client-side guard mirroring the backend (generate_fix
    // raises 400 for a resolved gap); a finding already in review or
    // closed by a decision has nothing to draft either.
    if (isClosedGap(selectedGap) || selectedGap.status === 'pr_opened' || selectedGap.review_id) {
      return selectedGap.review_id
    }

    setFixLoading(true)
    setActionError(null)
    try {
      const result = await generateFix(selectedGap.id)
      setGaps((prev) =>
        prev.map((g) =>
          g.id === selectedGap.id
            ? {
                ...g,
                remediation_drafts: result.remediation_drafts,
                status: result.review_id ? 'in_review' : 'fix_generated',
                review_id: result.review_id,
                review_state: result.review_state,
              }
            : g
        )
      )
      notifyDataChanged('fix_generated')
      return result.review_id
    } catch (err) {
      setActionError((err as Error).message)
      return null
    } finally {
      setFixLoading(false)
    }
  }, [selectedGap])

  // A readable gaps response with a null score means the graph is fine and
  // there is simply nothing in it -- the graph being unreachable fails the
  // request above instead, and lands in `error`.
  const isEmptyAccount = !loading && !error && score === null && gaps.length === 0

  return {
    summary,
    gaps,
    isEmptyAccount,
    score,
    scoreExplanation,
    selectedCommitSha,
    selectedGap,
    loading,
    error,
    fixLoading,
    actionError,
    selectCommit,
    runGenerateFix,
  }
}
