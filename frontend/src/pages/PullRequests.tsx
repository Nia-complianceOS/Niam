import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PRReviewModal } from '@/components/dashboard/PRReviewModal'
import {
  LoadingState,
  ErrorState,
  EmptyState,
  GetStartedState,
  PageHeader,
} from '@/components/shared/PageStates'
import { usePullRequests } from '@/hooks/usePullRequests'
import { useGitHubConnection } from '@/hooks/useGitHubConnection'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import type { PullRequest } from '@/types/api'

export default function PullRequests() {
  const { data, loading, error } = usePullRequests()
  // Only to tell the two empty states apart -- a connected user should
  // not be told to connect.
  const { connection } = useGitHubConnection()
  const connected = Boolean(connection?.connected)
  // Rows are clickable now. Opening a review used to be possible only in
  // the moment you created it -- close that modal and the wording was
  // unreachable, which is unusable for a reviewer who comes back later.
  const [selected, setSelected] = useState<PullRequest | null>(null)

  if (loading) return <LoadingState label="Loading review queue…" />
  if (error) return <ErrorState message={error} />

  const prs = data?.pull_requests ?? []
  const dryRunCount = prs.filter(
    (pr) => pr.id.startsWith('pr-dryrun') || pr.title.startsWith('[DRY RUN]')
  ).length

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Review Queue"
        title="Pull Requests"
        subtitle="Proposed policy amendments awaiting legal review."
      />

      {dryRunCount > 0 && (
        <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-[10px] bg-accent-amber/10 border border-accent-amber/30 text-[12.5px] leading-relaxed text-accent-amber">
          <AlertTriangle size={16} className="mt-[1px] flex-shrink-0" />
          <div>
            <b>
              {dryRunCount} of these {dryRunCount === 1 ? 'was' : 'were'} never
              sent to GitHub.
            </b>{' '}
            This instance runs with{' '}
            <span className="font-mono">GITHUB_DRY_RUN=true</span>, so
            amendments are drafted and recorded here but no pull request is
            created. Set it to <span className="font-mono">false</span> in the
            backend environment and restart the API to submit them for real.
          </div>
        </div>
      )}

      {prs.length === 0 ? (
        // Two different empty states. Telling a user who has already
        // connected GitHub and scanned a repository to "Connect GitHub"
        // reads as though their connection has been lost -- and the
        // button sends them somewhere they have already been.
        connected ? (
          <EmptyState
            title="Nothing waiting for review"
            message="Nothing has been sent for review yet. Open a finding on the Compliance Gaps page and draft the amendment; once you send it, it arrives here for legal to review before anything reaches GitHub."
            action={{ label: 'Go to Compliance Gaps', to: '/gaps' }}
          />
        ) : (
          <GetStartedState
            title="Nothing waiting for review"
            message="Connect GitHub and scan a repository to get started. When a finding needs a policy change, you draft the amendment on the Compliance Gaps page and it arrives here for review before anything is submitted."
          />
        )
      ) : (
        <div className="grid gap-2.5">
          {prs.map((pr) => {
            const isDryRun =
              pr.id.startsWith('pr-dryrun') || pr.title.startsWith('[DRY RUN]')
            return (
              <button
                key={pr.id}
                onClick={() => setSelected(pr)}
                className="text-left"
              >
                <Card className="p-4 flex items-center justify-between gap-4 hover:border-border transition-colors">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {pr.title.replace(/^\[DRY RUN\]\s*/, '')}
                    </div>
                    <div className="text-sm text-text-dim truncate">
                      {pr.repo_full_name}
                      {pr.files[0]?.file_path
                        ? ` · ${pr.files[0].file_path}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {isDryRun ? (
                      <Badge tone="muted">not submitted</Badge>
                    ) : (
                      <Badge
                        tone={
                          pr.status === 'merged'
                            ? 'good'
                            : pr.status === 'closed'
                              ? 'gap'
                              : 'muted'
                        }
                      >
                        {pr.status.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    <span className="text-sm text-text-dim hidden sm:inline">
                      {pr.reviewer}
                    </span>
                    <ChevronRight size={16} className="text-text-faint" />
                  </div>
                </Card>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <PRReviewModal pr={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
