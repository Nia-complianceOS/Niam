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

  const runGenerateFix = useCallback(async () => {
    if (!selectedGap) return
    setFixLoading(true)
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
      setError((err as Error).message)
    } finally {
      setFixLoading(false)
    }
  }, [selectedGap])

  const runOpenPR = useCallback(async (): Promise<PullRequest | null> => {
    if (!selectedGap) return null
    try {
      const result = await openPR(selectedGap.id)
      setGaps((prev) =>
        prev.map((g) => (g.id === selectedGap.id ? { ...g, pr_id: result.pull_request.id, status: 'pr_opened' } : g))
      )
      return result.pull_request
    } catch (err) {
      setError((err as Error).message)
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
    selectCommit: setSelectedCommitSha,
    runGenerateFix,
    runOpenPR,
  }
}