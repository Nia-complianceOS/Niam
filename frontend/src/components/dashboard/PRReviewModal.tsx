import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { PullRequest } from '@/types/api'
import { AlertTriangle, ExternalLink, FileText, X } from 'lucide-react'

interface Props {
  pr: PullRequest
  onClose: () => void
}

/**
 * A proposed policy amendment, for the person who signs it off.
 *
 * The reviewer is a lawyer. This used to render the raw markdown of the
 * amendment as a green diff, line by line, in a monospace font -- the
 * engineer's view of a change, shown to the one audience that cannot use
 * it. What matters to them is: which document, what is being added, and
 * what happens to the rest of it. The markdown source stays available in
 * the pull request itself for whoever wants it.
 */
export function PRReviewModal({ pr, onClose }: Props) {
  const isDryRun =
    pr.id.startsWith('pr-dryrun') || pr.title.startsWith('[DRY RUN]')
  const title = pr.title.replace(/^\[DRY RUN\]\s*/, '')

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card
        className="w-[760px] max-w-[95vw] max-h-[86vh] overflow-y-auto p-7 relative bg-surface/80 backdrop-blur-md border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-5 right-5 w-[30px] h-[30px] rounded-lg bg-white/[0.06] hover:bg-white/10 flex items-center justify-center"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <div className="mb-1 pr-10">
          <div className="font-display text-[19px] font-semibold leading-snug">
            {title}
          </div>
          <div className="text-[12.5px] text-text-faint mt-1">
            Proposed change to {pr.repo_full_name}
          </div>
        </div>

        {isDryRun && (
          <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-[10px] bg-accent-amber/10 border border-accent-amber/30 text-[12.5px] leading-relaxed text-accent-amber">
            <AlertTriangle size={16} className="mt-[1px] flex-shrink-0" />
            <div>
              <b>Preview only — nothing was sent.</b> This instance is running
              with <span className="font-mono">GITHUB_DRY_RUN=true</span>, so
              the change was drafted and recorded here but no pull request
              exists on GitHub. Set it to{' '}
              <span className="font-mono">false</span> and restart the API to
              submit for real.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
          <Meta label="Status">
            {/* Hardcoded "Awaiting review" until now, so a merged
                amendment still read as waiting for the review that had
                already happened. */}
            {isDryRun
              ? 'Not submitted'
              : pr.status === 'merged'
                ? 'Merged — applied'
                : pr.status === 'closed'
                  ? 'Closed without merging'
                  : 'Awaiting review'}
          </Meta>
          <Meta label="Reviewer">{pr.reviewer || '—'}</Meta>
          <Meta label="Documents">{pr.files.length}</Meta>
          <Meta label="Raised">
            {pr.opened_at ? new Date(pr.opened_at).toLocaleDateString() : '—'}
          </Meta>
        </div>

        <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2.5">
          What this changes
        </div>

        {pr.files.length === 0 && (
          <div className="text-[13px] text-text-faint mb-4">
            No document changes are attached to this request.
          </div>
        )}

        {pr.files.map((file, i) => (
          <Card key={i} className="mb-3 p-4">
            <div className="flex items-start gap-2.5 mb-3">
              <FileText size={16} className="text-accent-blue mt-[2px]" />
              <div>
                <div className="text-[13.5px] font-semibold">
                  {file.file_path || 'Policy document'}
                </div>
                <div className="text-[12px] text-text-dim mt-0.5">
                  A new section is added. Nothing already in this document is
                  changed or removed.
                </div>
              </div>
            </div>

            {file.summary && (
              <div className="mb-3">
                <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-1.5">
                  Why
                </div>
                <div className="text-[12.5px] text-text-dim leading-relaxed">
                  {file.summary}
                </div>
              </div>
            )}

            <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-1.5">
              Wording to be added
            </div>
            {/* Rendered as prose, not as a diff. The markers and heading
                syntax are noise to a reviewer judging the language. */}
            <div className="rounded-[10px] bg-accent-green/[0.05] border border-accent-green/15 px-4 py-3 text-[13px] leading-relaxed text-[#cfe9d8] whitespace-pre-wrap">
              {readableAmendment(file.diff_text || file.document || '')}
            </div>
          </Card>
        ))}

        <div className="flex gap-2.5 items-center flex-wrap mt-5">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {pr.github_pr_url ? (
            <a href={pr.github_pr_url} target="_blank" rel="noreferrer">
              <Button>
                <ExternalLink size={14} /> Review on GitHub
              </Button>
            </a>
          ) : (
            <Button
              disabled
              title={
                isDryRun
                  ? 'Nothing was submitted — this instance is in dry-run mode'
                  : 'No GitHub link recorded for this request'
              }
            >
              <ExternalLink size={14} /> Review on GitHub
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

/**
 * Strip the machine-facing scaffolding: the idempotency markers the PR
 * builder uses to find its own block, and markdown heading hashes.
 */
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
      <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="text-[13px] font-medium">{children}</div>
    </div>
  )
}
