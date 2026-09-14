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
import { AlertTriangle, ArrowRight, ExternalLink, FileText, GitPullRequest, User } from 'lucide-react'
import type { PullRequest, PRStatus } from '@/types/api'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'

function prTone(status: PRStatus, isDryRun: boolean): 'good' | 'warn' | 'gap' | 'muted' {
  if (isDryRun) return 'muted'
  switch (status) {
    case 'merged':
      return 'good'
    case 'closed':
      return 'gap'
    case 'ready_for_review':
      return 'warn'
    case 'awaiting_author':
    default:
      return 'muted'
  }
}

export default function PullRequests() {
  useSEO({
    title: 'Statutory Pull Requests',
    description: 'Review statutory policy amendments and code remediations proposed by Niam.',
  })

  const { data, loading, error } = usePullRequests()
  const { connection } = useGitHubConnection()
  const connected = Boolean(connection?.connected)
  const [selected, setSelected] = useState<PullRequest | null>(null)

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Remediation Queue"
          title="Pull Requests"
          subtitle="Proposed policy amendments and statutory remediations awaiting legal review."
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Remediation Queue"
          title="Pull Requests"
          subtitle="Proposed policy amendments and statutory remediations awaiting legal review."
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-[1280px]"
    >
      <PageHeader
        eyebrow="Remediation Queue"
        title="Pull Requests"
        subtitle="Proposed policy amendments and statutory remediations awaiting legal review."
      />

      {dryRunCount > 0 && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded border border-warning/30 bg-warning/5 text-xs text-warning-text leading-relaxed">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-warning" />
          <div>
            <span className="font-medium text-text-primary">
              {dryRunCount} of these {dryRunCount === 1 ? 'draft amendment was' : 'draft amendments were'} generated in local dry-run mode.
            </span>{' '}
            The backend is configured with <code className="font-mono text-[11px] bg-surface-sunken px-1.5 py-0.5 rounded border border-border-subtle text-text-primary">GITHUB_DRY_RUN=true</code>.
            Remediation diffs are drafted and recorded in the audit ledger, but upstream GitHub PR submission is suppressed. Set to <code className="font-mono text-[11px] bg-surface-sunken px-1.5 py-0.5 rounded border border-border-subtle text-text-primary">false</code> in your API environment to open live pull requests.
          </div>
        </div>
      )}

      {prs.length === 0 ? (
        connected ? (
          <EmptyState
            title="No Pending Remediation Requests"
            message="No policy amendments or remediation pull requests are currently awaiting review. Inspect findings on the Compliance Gaps queue to draft amendments; once drafted, dossiers appear here for counsel sign-off."
            action={{ label: 'Inspect Compliance Gaps', to: '/gaps' }}
          />
        ) : (
          <GetStartedState
            title="Repository Connection Required"
            message="Connect a source repository to begin automated compliance audits. When statutory gaps are detected, you can draft remediation PRs and review them here prior to submission."
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {prs.map((pr) => {
            const isDryRun = pr.id.startsWith('pr-dryrun') || pr.title.startsWith('[DRY RUN]')
            const tone = prTone(pr.status, isDryRun)
            const cleanTitle = pr.title.replace(/^\[DRY RUN\]\s*/, '')
            const filesCount = pr.files?.length || 0

            return (
              <Card 
                key={pr.id} 
                className="flex flex-col h-full border-border bg-surface hover:border-border-strong hover:bg-surface-raised transition-all group cursor-pointer"
                onClick={() => setSelected(pr)}
              >
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <Badge tone={tone}>
                        {isDryRun ? 'DRY RUN' : pr.status.replace(/_/g, ' ').toUpperCase()}
                      </Badge>

                      <div className="flex items-center gap-1.5">
                        {pr.github_pr_url && (
                          <a 
                            href={pr.github_pr_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-text-muted hover:text-text-primary transition-colors p-1 rounded hover:bg-surface-sunken"
                            onClick={(e) => e.stopPropagation()}
                            title="Open on GitHub"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </div>

                    <h3 className="font-sans font-medium text-sm text-text-primary group-hover:text-accent-clause transition-colors mb-2 line-clamp-2 leading-snug">
                      {cleanTitle}
                    </h3>

                    <div className="flex items-center gap-1.5 text-xs font-mono text-text-muted mb-3 truncate">
                      <GitPullRequest size={12} className="flex-shrink-0 text-text-faint" />
                      <span className="truncate">{pr.repo_full_name}</span>
                    </div>

                    {pr.regulations && pr.regulations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {pr.regulations.map((reg) => (
                          <span
                            key={reg}
                            className="font-mono text-[10px] text-accent-clause bg-accent-clause/5 border border-accent-clause/20 px-1.5 py-0.5 rounded"
                          >
                            {reg}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-[11px] text-text-muted">
                    <div className="flex items-center gap-1">
                      <FileText size={11} className="text-text-faint" />
                      <span>{filesCount} {filesCount === 1 ? 'file' : 'files'}</span>
                    </div>
                    {pr.opened_at && (
                      <span className="font-mono">
                        {new Date(pr.opened_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="px-5 py-3 border-t border-border-subtle bg-surface-sunken flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-text-muted truncate mr-2">
                    <User size={12} className="text-text-faint flex-shrink-0" />
                    <span className="truncate">{pr.reviewer || 'Unassigned Reviewer'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-text-primary group-hover:text-accent-clause font-medium text-xs transition-colors whitespace-nowrap">
                    <span>Examine Draft</span>
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
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
