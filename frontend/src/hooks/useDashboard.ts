import { useCallback, useEffect, useState } from 'react'
import { generateFix, getDashboardSummary, getGaps, openPR } from '@/services/api/client'
import type { DashboardSummaryResponse, Gap, PullRequest } from '@/types/api'

interface UseDashboardResult {
  summary: DashboardSummaryResponse | null
  gaps: Gap[]
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
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null)
  const [gaps, setGaps] = useState<Gap[]>([])
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

  useEffect(() => {
    Promise.all([getDashboardSummary(), getGaps()])
      .then(([summaryData, gapsData]) => {
        setSummary(summaryData)
        setGaps(gapsData.gaps)
        if (summaryData.recent_commits.length) {
          setSelectedCommitSha(summaryData.recent_commits[0].commit.sha)
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

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

  return {
    summary,
    gaps,
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
