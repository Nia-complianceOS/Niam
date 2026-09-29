import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { PullRequest, ReviewSummary } from '@/types/api'
import { AlertTriangle, ExternalLink, FileText, X } from 'lucide-react'

interface Props {
  pr: PullRequest
  /** The review that approved this pull request, when there was one. */
  review?: ReviewSummary | null
  onClose: () => void
}

/**
 * Read-only view of a pull request Niam opened, as legal prose rather than
 * a code diff. There is no way to open a pull request from here (or
 * anywhere but owner approval on /reviews/:id); a PR opened through
 * review carries the approval record in its body, shown here too.
 */
export function PRReviewModal({ pr, review, onClose }: Props) {
  const isDryRun =
    pr.id.startsWith('pr-dryrun') || pr.title.startsWith('[DRY RUN]')
  const title = pr.title.replace(/^\[DRY RUN\]\s*/, '')
  const legal = review?.approvals.legal
  const owner = review?.approvals.owner
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-review-title"
        className="w-[740px] max-w-[95vw] max-h-[88vh] overflow-y-auto p-6 sm:p-7 relative bg-surface border border-border rounded shadow-2xl text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          className="absolute top-5 right-5 p-1.5 rounded border border-border text-text-tertiary hover:text-text-primary hover:bg-bg transition-colors"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={15} />
        </button>

        <div className="pr-8 space-y-1">
          <div className="flex items-center gap-2 font-mono text-[10px] text-text-tertiary uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-entity-clause" />
            <span>STATUTORY AMENDMENT PROPOSAL // {pr.repo_full_name}</span>
          </div>
          <h2 id="pr-review-title" className="font-serif text-xl sm:text-2xl font-medium text-text-primary leading-snug">
            {title}
          </h2>
        </div>

        {isDryRun && (
          <div className="mt-4 p-3 rounded border border-status-warning/30 bg-status-warning/10 text-xs text-status-warning leading-relaxed flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium font-mono text-[11px]">PREVIEW ONLY: </span>
              This instance is operating with <code className="font-mono bg-bg px-1 py-0.5 rounded border border-status-warning/20">GITHUB_DRY_RUN=true</code>. The statutory amendment is drafted in local state, but no external pull request was created on GitHub.
            </div>
          </div>
        )}

        {/* Forensic Metadata Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5 p-3 rounded border border-border bg-bg">
          <Meta label="APPROVAL STATE">
            <span className={`font-mono text-[11px] font-medium ${
              pr.status === 'merged' 
                ? 'text-status-compliant' 
                : pr.status === 'closed' 
                ? 'text-status-gap' 
                : 'text-status-warning'
            }`}>
              {isDryRun
                ? 'NOT SUBMITTED'
                : pr.status === 'merged'
                ? 'MERGED // APPLIED'
                : pr.status === 'closed'
                ? 'CLOSED'
                : 'OPEN // AWAITING MERGE'}
            </span>
          </Meta>
          <Meta label="LEGAL APPROVAL">{legal?.by || (review ? '—' : 'Before approval workflow')}</Meta>
          <Meta label="AMENDED DOCUMENTS">{pr.files.length} Schedule{pr.files.length === 1 ? '' : 's'}</Meta>
          <Meta label="RECORDED DATE">
            {pr.opened_at ? new Date(pr.opened_at).toLocaleDateString() : '—'}
          </Meta>
        </div>

        {review ? (
          <div className="mb-5 p-3 rounded border border-border bg-bg text-xs leading-relaxed text-text-secondary">
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-1">Approval record</div>
            <p>
              Legal: <span className="text-text-primary">{legal?.by ?? '—'}</span>
              {legal?.version_no ? ` (version ${legal.version_no})` : ''}
              {legal?.at ? `, ${new Date(legal.at).toLocaleString()}` : ''}
            </p>
            <p>
              Owner: <span className="text-text-primary">{owner?.by ?? '—'}</span>
              {owner?.at ? `, ${new Date(owner.at).toLocaleString()}` : ''}
            </p>
            {review.self_approved && (
              <p className="text-status-warning">Self-approved: one person gave both approvals.</p>
            )}
            <Link to={`/reviews/${review.id}`} className="inline-block mt-1 text-text-primary underline underline-offset-4">
              Open the review and its audit record
            </Link>
          </div>
        ) : (
          <div className="mb-5 p-3 rounded border border-border bg-bg text-xs text-text-tertiary leading-relaxed">
            Opened before the approval workflow; it carries no legal or owner approval record.
          </div>
        )}

        <div className="space-y-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            Proposed Statutory Amendments
          </div>

          {pr.files.length === 0 && (
            <div className="p-4 rounded border border-border bg-bg text-text-tertiary">
              No document clauses are attached to this proposal.
            </div>
          )}

          {pr.files.map((file, i) => (
            <div key={i} className="p-4 rounded border border-border bg-bg space-y-3">
              <div className="flex items-start gap-2.5">
                <FileText size={15} className="text-entity-clause mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-mono text-xs font-medium text-text-primary">
                    {file.file_path || file.document || 'Privacy Policy Schedule'}
                  </div>
                  <div className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                    Appends a declared processing purpose schedule. Existing clauses remain unaltered.
                  </div>
                </div>
              </div>

              {file.summary && (
                <div className="p-2.5 rounded border border-border/80 bg-surface">
                  <span className="font-mono text-[10px] text-text-tertiary uppercase block mb-1">
                    Statutory Rationale
                  </span>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {file.summary}
                  </p>
                </div>
              )}

              <div>
                <span className="font-mono text-[10px] text-text-tertiary uppercase block mb-1.5">
                  Prose Wording To Be Inserted
                </span>
                <div className="rounded border border-border bg-surface p-3.5 text-xs text-text-primary font-serif leading-relaxed whitespace-pre-wrap">
                  {readableAmendment(file.diff_text || file.document || '')}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Controls */}
        <div className="flex items-center justify-between gap-3 pt-5 mt-6 border-t border-border">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg transition-colors"
          >
            Dismiss Dialog
          </button>

          {pr.github_pr_url ? (
            <a
              href={pr.github_pr_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium bg-text-primary text-bg hover:opacity-90 transition-opacity shadow-xs"
            >
              <span>Examine Pull Request on GitHub</span>
              <ExternalLink size={12} />
            </a>
          ) : (
            <button
              disabled
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium bg-text-primary text-bg opacity-50 cursor-not-allowed"
              title={isDryRun ? 'Dry-run mode active' : 'No repository link available'}
            >
              <span>GitHub Pull Request Not Linked</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function readableAmendment(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, ''))
    .join('\n')
    .trim()
}

function Meta({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="font-mono text-[9px] text-text-tertiary uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="text-xs font-medium text-text-primary truncate">{children}</div>
    </div>
  )
}
