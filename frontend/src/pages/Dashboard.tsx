import { useState } from 'react'
import { StatCard } from '@/components/ui/StatCard'
import { ComplianceTimeline } from '@/components/dashboard/ComplianceTimeline'
import { GitHubActivityFeed } from '@/components/dashboard/GitHubActivityFeed'
import { ComplianceImpactPanel } from '@/components/dashboard/ComplianceImpactPanel'
import { PRReviewModal } from '@/components/dashboard/PRReviewModal'
import { Card } from '@/components/ui/Card'
import { useDashboard } from '@/hooks/useDashboard'
import type { PullRequest } from '@/types/api'

export default function Dashboard() {
  const {
    summary,
    selectedCommitSha,
    selectedGap,
    loading,
    error,
    fixLoading,
    selectCommit,
    runGenerateFix,
    runOpenPR,
  } = useDashboard()

  const [openedPR, setOpenedPR] = useState<PullRequest | null>(null)

  const handleOpenPR = async () => {
    const pr = await runOpenPR()
    if (pr) setOpenedPR(pr)
  }

  if (loading) {
    return (
      <div className="max-w-[1280px] flex items-center justify-center h-[60vh] text-text-dim text-sm font-mono">
        Loading compliance data…
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="max-w-[1280px]">
        <Card className="p-6 border-accent-red/30">
          <div className="text-accent-red font-semibold mb-1">Couldn't reach the backend</div>
          <div className="text-text-dim text-sm">{error}</div>
          <div className="text-text-faint text-xs mt-3">
            Check that the API is running and VITE_API_BASE_URL in .env points to it.
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px]">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-blue uppercase tracking-wide mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green" style={{ boxShadow: '0 0 8px #33d17a' }} />
          LIVE · SYNCED {new Date(summary.synced_at).toLocaleTimeString()}
        </div>
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Compliance Overview</h1>
        <div className="text-text-dim text-sm mt-1.5 max-w-[560px]">
          Your code changes every day. Your compliance should too.
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-4">
        {summary.stat_cards.map((card, i) => (
          <StatCard key={i} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-[1.15fr_1fr] gap-4 mb-4 items-start">
        <ComplianceTimeline steps={summary.timeline} />
        <GitHubActivityFeed
          commits={summary.recent_commits}
          selectedSha={selectedCommitSha}
          onSelect={selectCommit}
        />
      </div>

      <ComplianceImpactPanel
        gap={selectedGap}
        fixLoading={fixLoading}
        onGenerateFix={runGenerateFix}
        onOpenPR={handleOpenPR}
      />

      {openedPR && <PRReviewModal pr={openedPR} onClose={() => setOpenedPR(null)} />}
    </div>
  )
}