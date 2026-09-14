import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PRReviewModal } from '@/components/dashboard/PRReviewModal'
import {
  ErrorState,
  EmptyState,
  GetStartedState,
  PageHeader,
} from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { usePullRequests } from '@/hooks/usePullRequests'
import { useGitHubConnection } from '@/hooks/useGitHubConnection'
import { AlertTriangle, ChevronRight, ExternalLink } from 'lucide-react'
import type { PullRequest } from '@/types/api'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'

export default function PullRequests() {
  useSEO({
    title: 'Pull Requests',
    description: 'Review policy amendments proposed by Niam.',
  })

  const { data, loading, error } = usePullRequests()
  const { connection } = useGitHubConnection()
  const connected = Boolean(connection?.connected)
  const [selected, setSelected] = useState<PullRequest | null>(null)

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Review Queue"
          title="Pull Requests"
          subtitle="Proposed policy amendments awaiting legal review."
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Review Queue"
          title="Pull Requests"
          subtitle="Proposed policy amendments awaiting legal review."
        />
        <TableSkeleton rows={3} />
      </div>
    )
  }

  const prs = data?.pull_requests ?? []
  const dryRunCount = prs.filter(
    (pr) => pr.id.startsWith('pr-dryrun') || pr.title.startsWith('[DRY RUN]')
  ).length

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1280px]"
    >
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {prs.map((pr) => {
            const isDryRun = pr.id.startsWith('pr-dryrun') || pr.title.startsWith('[DRY RUN]')
            return (
              <Card 
                key={pr.id} 
                className="flex flex-col h-full hover:border-accent-blue/50 transition-colors group cursor-pointer relative"
                onClick={() => setSelected(pr)}
              >
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    {isDryRun ? (
                      <Badge tone="muted">Not submitted</Badge>
                    ) : (
                      <Badge tone={pr.status === 'merged' ? 'good' : pr.status === 'closed' ? 'gap' : 'muted'}>
                        {pr.status.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {pr.github_pr_url && (
                      <a 
                        href={pr.github_pr_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-text-faint hover:text-accent-blue transition-colors p-1"
                        onClick={(e) => e.stopPropagation()}
                        title="View on GitHub"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  
                  <h3 className="font-semibold text-[15px] mb-1.5 line-clamp-2">
                    {pr.title.replace(/^\[DRY RUN\]\s*/, '')}
                  </h3>
                  
                  <div className="text-[13px] text-text-dim truncate">
                    {pr.repo_full_name}
                  </div>
                </div>
                
                <div className="px-4 py-3 border-t border-border-soft bg-black/20 flex items-center justify-between text-[12px]">
                  <span className="text-text-faint truncate mr-2">{pr.reviewer || 'No reviewer assigned'}</span>
                  <div className="flex items-center text-accent-blue opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    Review <ChevronRight size={14} className="ml-0.5" />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {selected && (
        <PRReviewModal pr={selected} onClose={() => setSelected(null)} />
      )}
    </motion.div>
  )
}
