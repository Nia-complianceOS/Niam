import { StatCard } from '@/components/ui/StatCard'
import { ComplianceTimeline } from '@/components/dashboard/ComplianceTimeline'
import { GitHubActivityFeed } from '@/components/dashboard/GitHubActivityFeed'
import { Card } from '@/components/ui/Card'
import { GapList } from '@/components/gaps/GapList'
import { GetStartedState, LoadingState, PageHeader } from '@/components/shared/PageStates'
import { useDashboard } from '@/hooks/useDashboard'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export default function Dashboard() {
  // The gaps come from this hook too. The page used to call useGaps()
  // alongside it purely to read the same list a second time, which meant
  // two requests for one page and two copies of one account's findings in
  // memory. It is read-only here either way: the dashboard shows the most
  // urgent findings and hands off to /gaps for the actual work.
  const {
    summary,
    gaps,
    isEmptyAccount,
    scoreExplanation,
    selectedCommitSha,
    loading,
    error,
    selectCommit,
  } = useDashboard()
  const navigate = useNavigate()
  const topGaps = gaps.filter((g) => g.status !== 'resolved').slice(0, 5)

  if (loading) return <LoadingState label="Loading compliance data…" />

  // Only a real failure reaches here now. A missing summary used to be
  // folded into this branch, so an account that simply had no data yet was
  // told the backend was unreachable.
  if (error) {
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

  /**
   * A brand-new account gets the next action, not a dashboard of zeros.
   *
   * Five cards reading 0, 0, 0 next to a compliance score is the single
   * most misleading thing this app could put in front of a compliance
   * reviewer: it looks like a clean bill of health from a system that has
   * never read a line of their code. The backend refuses to invent the
   * score for exactly this reason and sends the explanation instead, which
   * is rendered here word for word.
   */
  if (!summary || isEmptyAccount) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Getting started"
          title="Compliance Overview"
          subtitle="Your code changes every day. Your compliance should too."
        />
        <GetStartedState
          title="Nothing to show yet"
          message="Connect GitHub and scan a repository to get started. Once a scan has run, this page shows what personal data your code handles, where it goes, and what the DPDP Act requires of you."
          detail={scoreExplanation}
        />
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

      {/* Five cards on one row. A four-column grid left the fifth alone
          on a second row with three empty cells beside it. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5 mb-4">
        {summary.stat_cards.map((card, i) => (
          <StatCard key={i} {...card} />
        ))}
      </div>

      {/* These two panels have no real data source yet (no commit-history
          store, no webhook event log), so the backend returns them empty
          unless USE_MOCKS=true. When it does send samples, sample_panels
          is set and we label them -- unlabelled fiction on the front page
          is the fastest way to lose a reviewer's trust. */}
      {(summary.timeline.length > 0 || summary.recent_commits.length > 0) && (
        <div className="mb-4">
          {summary.sample_panels && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-accent-amber/40 bg-accent-amber/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-amber">
              Sample data — not from your graph
            </div>
          )}
          {/* The two panels have independent sources now -- the commit
              feed is real whenever gaps carry provenance, the timeline is
              samples-only -- so the layout has to survive either one being
              absent rather than rendering an empty card beside a full one. */}
          <div
            className={
              summary.timeline.length > 0 && summary.recent_commits.length > 0
                ? 'grid grid-cols-[1.15fr_1fr] gap-4 items-start'
                : 'grid grid-cols-1 gap-4 items-start'
            }
          >
            {summary.timeline.length > 0 && <ComplianceTimeline steps={summary.timeline} />}
            {summary.recent_commits.length > 0 && (
              <GitHubActivityFeed
                commits={summary.recent_commits}
                selectedSha={selectedCommitSha}
                onSelect={selectCommit}
              />
            )}
          </div>
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="font-display text-[15px] font-semibold">
            Needs attention
          </div>
          <Link
            to="/gaps"
            className="text-[12.5px] text-accent-blue hover:brightness-125 flex items-center gap-1"
          >
            All findings <ArrowRight size={13} />
          </Link>
        </div>
        <div className="text-xs text-text-faint mb-4">
          The most urgent open findings. Select one to review it and draft a
          fix.
        </div>

        {topGaps.length === 0 ? (
          <div className="text-[13px] text-text-faint py-6 text-center">
            Nothing outstanding right now. New findings appear here after each
            scan.
          </div>
        ) : (
          <GapList
            gaps={topGaps}
            selectedId={null}
            onSelect={(id) => navigate(`/gaps?select=${encodeURIComponent(id)}`)}
            visibleRows={5}
          />
        )}
      </Card>
    </div>
  )
}