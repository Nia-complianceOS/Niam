import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  generateFix,
  getDashboardSummary,
  getGaps,
  isAbortError,
  openPR,
} from '@/services/api/client'
import type { DashboardSummaryResponse, Gap, PullRequest } from '@/types/api'

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
  scoreExplanation: string | null
  selectedCommitSha: string | null
  selectedGap: Gap | undefined
  loading: boolean
  error: string | null
  fixLoading: boolean
  actionError: string | null
  selectCommit: (sha: string) => void
  runGenerateFix: () => Promise<void>
  runOpenPR: () => Promise<PullRequest | null>
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
  // but a specific action (generate-fix / open-pr) failed — e.g. the gap
  // was already resolved, or open-pr was called before any fix was
  // generated. That should surface inline next to the button that
  // triggered it, not blow away stat cards / timeline / activity feed that
  // are all still perfectly valid.
  const [actionError, setActionError] = useState<string | null>(null)

  // Every reply is checked against this before it is allowed to become
  // state. Signing out aborts the requests, but a reply that was already
  // decoded must not be written into a page that now belongs to somebody
  // else -- so the run number, not just the abort, is the guard.
  const runRef = useRef(0)

  useEffect(() => {
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

  const runGenerateFix = useCallback(async () => {
    if (!selectedGap) return
    // Defensive client-side guard mirroring the backend's own check
    // (gap_service.generate_fix raises 400 for an already-resolved gap).
    // The UI shouldn't normally even show the button in this state (see
    // ComplianceImpactPanel's status branching), but this keeps the hook
    // safe to call from anywhere.
    if (selectedGap.status === 'resolved' || selectedGap.status === 'pr_opened') return

    setFixLoading(true)
    setActionError(null)
    try {
      const result = await generateFix(selectedGap.id)
      setGaps((prev) =>
        prev.map((g) =>
          g.id === selectedGap.id
            ? { ...g, remediation_drafts: result.remediation_drafts, status: 'fix_generated' }
            : g
        )
      )
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setFixLoading(false)
    }
  }, [selectedGap])

  const runOpenPR = useCallback(async (): Promise<PullRequest | null> => {
    if (!selectedGap) return null
    setActionError(null)
    try {
      const result = await openPR(selectedGap.id)
      setGaps((prev) =>
        prev.map((g) => (g.id === selectedGap.id ? { ...g, pr_id: result.pull_request.id, status: 'pr_opened' } : g))
      )
      return result.pull_request
    } catch (err) {
      // Backend returns HTTPException(400) here if the gap has no
      // remediation drafts yet (see github_service.open_compliance_pr) —
      // client.ts's interceptor surfaces that detail message directly.
      setActionError((err as Error).message)
      return null
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
    scoreExplanation,
    selectedCommitSha,
    selectedGap,
    loading,
    error,
    fixLoading,
    actionError,
    selectCommit,
    runGenerateFix,
    runOpenPR,
  }
}
