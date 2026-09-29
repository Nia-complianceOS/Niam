import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, ExternalLink, GitPullRequest, ShieldOff } from 'lucide-react'
import type { Gap, ReviewSummary } from '@/types/api'
import { getReview, isAbortError } from '@/services/api/client'
import { useDataVersion } from '@/lib/dataEvents'
import { formatDay, isDryRunPr, prNumberFromUrl, relativeTime } from './reviewLanguage'

/**
 * Where a finding's fix stands in the two-stage review, for the finding
 * panels (gap detail, dashboard). Replaces the old direct "Open PR"
 * button: a pull request now opens only on owner approval, from the
 * review page this links to.
 *
 * The gap carries only the review's id and state; the reason, review-by
 * date, approvals and any error come from the review itself, fetched here.
 */
export function GapReviewStatus({ gap, compact = false }: { gap: Gap; compact?: boolean }) {
  const review = useReviewSummary(gap.review_id)
  const reviewLink = gap.review_id ? `/reviews/${gap.review_id}` : null

  if (gap.status === 'pr_opened' && !gap.review_id) {
    return (
      <Note icon={<GitPullRequest size={14} />} tone="neutral" title={`Pull request${gap.pr_number ? ` #${gap.pr_number}` : ''} opened`}>
        <p>Opened before the approval workflow, so it carries no legal or owner approval record.</p>
        <PrLink url={gap.pr_url} />
      </Note>
    )
  }

  if (!gap.review_id || !gap.review_state) return null
  const state = review?.state ?? gap.review_state

  const openReview = reviewLink ? (
    <Link
      to={reviewLink}
      className="inline-flex items-center gap-1 font-medium text-text-primary underline-offset-4 hover:underline"
    >
      Open the review <ArrowRight size={12} aria-hidden />
    </Link>
  ) : null

  switch (state) {
    case 'in_legal_review':
      return (
        <Note icon={<Clock size={14} />} tone="warning" title="With legal review">
          {!compact && (
            <p>
              Legal can edit the wording, ask the AI to redo it, approve it for owner sign-off, or
              mark it not required. Nothing reaches the repository until the owner approves.
            </p>
          )}
          {openReview}
        </Note>
      )
    case 'legal_approved':
      return (
        <Note icon={<Clock size={14} />} tone="warning" title="Awaiting owner approval">
          {review?.approvals.legal && (
            <p>
              Legal approval: {review.approvals.legal.by}
              {review.approvals.legal.version_no ? ` (version ${review.approvals.legal.version_no})` : ''},{' '}
              {relativeTime(review.approvals.legal.at)}.
            </p>
          )}
          {!compact && <p>The pull request opens when the owner approves.</p>}
          {openReview}
        </Note>
      )
    case 'owner_approved':
      return (
        <Note icon={<AlertTriangle size={14} />} tone="gap" title="Approved — the pull request did not open">
          {review?.last_error && <p className="break-words">{review.last_error}</p>}
          <p>The owner can retry from the review.</p>
          {openReview}
        </Note>
      )
    case 'pending_owner_ack':
      return (
        <Note icon={<ShieldOff size={14} />} tone="warning" title="Marked not required — awaiting owner">
          {review?.outcome_reason && (
            <p>
              Legal proposes to {review.proposed_outcome === 'risk_accepted' ? 'accept the risk' : 'dismiss the finding'}:{' '}
              “{review.outcome_reason}”
            </p>
          )}
          {openReview}
        </Note>
      )
    case 'pr_opened': {
      const url = review?.pr_url ?? gap.pr_url
      const num = gap.pr_number ?? prNumberFromUrl(url)
      const dry = review ? isDryRunPr(review.pr_id, review.pr_url) : false
      return (
        <Note
          icon={<CheckCircle2 size={14} />}
          tone="compliant"
          title={dry ? 'Approved — dry-run pull request recorded' : `Pull request${num ? ` #${num}` : ''} opened`}
        >
          {review?.approvals.legal && review.approvals.owner && (
            <p>
              Approved by {review.approvals.legal.by} (legal) and {review.approvals.owner.by} (owner)
              {review.self_approved ? ' — self-approved' : ''}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <PrLink url={url} />
            {openReview}
          </div>
        </Note>
      )
    }
    case 'dismissed':
      return (
        <Note icon={<ShieldOff size={14} />} tone="neutral" title="Dismissed">
          {review?.outcome_reason && <p>“{review.outcome_reason}”</p>}
          {openReview}
        </Note>
      )
    case 'risk_accepted':
      return (
        <Note
          icon={<ShieldOff size={14} />}
          tone="neutral"
          title={`Risk accepted${review?.review_by ? ` until ${formatDay(review.review_by)}` : ''}`}
        >
          {review?.outcome_reason && <p>“{review.outcome_reason}”</p>}
          {openReview}
        </Note>
      )
  }
}

function useReviewSummary(reviewId: string | null): ReviewSummary | null {
  const version = useDataVersion()
  const [review, setReview] = useState<ReviewSummary | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!reviewId) {
      setReview(null)
      return
    }
    getReview(reviewId)
      .then((r) => {
        if (!cancelled) setReview(r)
      })
      .catch((err) => {
        if (!cancelled && !isAbortError(err)) setReview(null)
      })
    return () => {
      cancelled = true
    }
  }, [reviewId, version])
  // Never show one finding's review under another while the next loads.
  return review && review.id === reviewId ? review : null
}

const NOTE_TONE = {
  warning: 'border-status-warning/30 bg-status-warning/5',
  compliant: 'border-status-compliant/30 bg-status-compliant/5',
  gap: 'border-status-gap/30 bg-status-gap/5',
  neutral: 'border-border bg-bg',
} as const

const ICON_TONE = {
  warning: 'text-status-warning',
  compliant: 'text-status-compliant',
  gap: 'text-status-gap',
  neutral: 'text-text-tertiary',
} as const

function Note({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode
  tone: keyof typeof NOTE_TONE
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className={`p-3 rounded border text-xs leading-relaxed ${NOTE_TONE[tone]}`} role="status">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 flex-shrink-0 ${ICON_TONE[tone]}`} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 space-y-1 text-text-secondary">
          <div className="font-medium text-text-primary">{title}</div>
          {children}
        </div>
      </div>
    </div>
  )
}

function PrLink({ url }: { url: string | null | undefined }) {
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-text-primary underline-offset-4 hover:underline"
    >
      View on GitHub <ExternalLink size={12} aria-hidden />
    </a>
  )
}
