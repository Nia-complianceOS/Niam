import { Check, AlertTriangle, ExternalLink } from 'lucide-react'
import type { ReviewDetail, ReviewEvent } from '@/types/api'
import {
  absoluteTime,
  eventSentence,
  formatDay,
  isDryRunPr,
  prNumberFromUrl,
  REVIEW_STATE_LABELS,
  roleLabel,
} from './reviewLanguage'

type StepStatus = 'done' | 'current' | 'upcoming' | 'error'

interface Step {
  label: string
  status: StepStatus
  note?: string
}

/** Drafted → Legal review → Owner approval → Pull request, or the
 *  not-required branch ending in Dismissed / Risk accepted. */
export function reviewSteps(r: ReviewDetail): Step[] {
  const legal = r.approvals.legal
  const owner = r.approvals.owner
  const first = r.versions[0]
  const drafted: Step = {
    label: 'Drafted',
    status: 'done',
    note: first ? (first.author_kind === 'ai' ? 'AI draft' : first.author_name ?? undefined) : undefined,
  }
  const notRequired =
    r.state === 'pending_owner_ack' || r.state === 'dismissed' || r.state === 'risk_accepted'

  if (notRequired) {
    const outcome = r.state === 'pending_owner_ack' ? r.proposed_outcome : r.state
    const closed = r.state !== 'pending_owner_ack'
    return [
      drafted,
      { label: 'Legal review', status: 'done', note: 'Marked not required' },
      {
        label: 'Owner confirmation',
        status: closed ? 'done' : 'current',
        note: closed ? 'Confirmed' : 'Waiting',
      },
      {
        label: outcome === 'risk_accepted' ? 'Risk accepted' : 'Dismissed',
        status: closed ? 'done' : 'upcoming',
        note: outcome === 'risk_accepted' && r.review_by ? `Review by ${formatDay(r.review_by)}` : undefined,
      },
    ]
  }

  const prNum = prNumberFromUrl(r.pr_url)
  const dry = isDryRunPr(r.pr_id, r.pr_url)
  return [
    drafted,
    {
      label: 'Legal review',
      status: r.state === 'in_legal_review' ? 'current' : 'done',
      note: legal ? `${legal.by}${legal.version_no ? ` · v${legal.version_no}` : ''}` : 'Waiting',
    },
    {
      label: 'Owner approval',
      status: r.state === 'legal_approved' ? 'current' : r.state === 'in_legal_review' ? 'upcoming' : 'done',
      note: owner ? owner.by : r.state === 'legal_approved' ? 'Waiting' : undefined,
    },
    {
      label: 'Pull request',
      status:
        r.state === 'pr_opened'
          ? 'done'
          : r.state === 'owner_approved'
            ? r.last_error
              ? 'error'
              : 'current'
            : 'upcoming',
      note:
        r.state === 'pr_opened'
          ? dry
            ? 'Dry run'
            : prNum
              ? `#${prNum}`
              : 'Opened'
          : r.state === 'owner_approved' && r.last_error
            ? 'Failed to open'
            : undefined,
    },
  ]
}

const DOT: Record<StepStatus, string> = {
  done: 'bg-text-primary border-text-primary text-bg',
  current: 'bg-status-warning/15 border-status-warning text-status-warning',
  upcoming: 'bg-surface border-border text-text-tertiary',
  error: 'bg-status-gap/15 border-status-gap text-status-gap',
}

export function ReviewStepper({ review }: { review: ReviewDetail }) {
  const steps = reviewSteps(review)
  return (
    <ol className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-4" aria-label="Review progress">
      {steps.map((s, i) => (
        <li
          key={s.label}
          aria-current={s.status === 'current' || s.status === 'error' ? 'step' : undefined}
          className="relative min-w-0"
        >
          <div className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${DOT[s.status]}`}
              aria-hidden
            >
              {s.status === 'done' ? (
                <Check size={11} strokeWidth={2.5} />
              ) : s.status === 'error' ? (
                <AlertTriangle size={10} strokeWidth={2.5} />
              ) : (
                i + 1
              )}
            </span>
            {i < steps.length - 1 && (
              <span
                className={`hidden sm:block h-px flex-1 ${s.status === 'done' ? 'bg-text-primary/40' : 'bg-border'}`}
                aria-hidden
              />
            )}
          </div>
          <div
            className={`mt-1.5 text-xs font-medium ${
              s.status === 'upcoming' ? 'text-text-tertiary' : 'text-text-primary'
            }`}
          >
            {s.label}
            <span className="sr-only">
              {' '}
              ({s.status === 'done' ? 'done' : s.status === 'current' ? 'current step' : s.status === 'error' ? 'failed' : 'not started'})
            </span>
          </div>
          {s.note && <div className="text-[11px] text-text-tertiary truncate">{s.note}</div>}
        </li>
      ))}
    </ol>
  )
}

/** The two signatures, as they will appear in the pull request body. */
export function ApprovalRecord({ review }: { review: ReviewDetail }) {
  const { legal, owner } = review.approvals
  return (
    <section aria-labelledby="approval-record" className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 id="approval-record" className="font-mono text-eyebrow uppercase text-text-tertiary">
          Approval record
        </h2>
        {review.self_approved && <SelfApprovedTag />}
      </div>
      <dl className="space-y-3 text-xs">
        <div>
          <dt className="text-text-tertiary">Legal approval</dt>
          <dd className="text-text-primary mt-0.5">
            {legal ? (
              <>
                {legal.by}
                {legal.role && legal.role !== 'legal' ? ` (acting as legal, ${roleLabel(legal.role).toLowerCase()})` : ''}
                <span className="block text-text-tertiary font-mono text-[11px] mt-0.5">
                  {legal.version_no ? `Version ${legal.version_no} · ` : ''}
                  {absoluteTime(legal.at)}
                </span>
              </>
            ) : (
              <span className="text-text-tertiary">Not yet given</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-text-tertiary">Owner approval</dt>
          <dd className="text-text-primary mt-0.5">
            {owner ? (
              <>
                {owner.by}
                <span className="block text-text-tertiary font-mono text-[11px] mt-0.5">{absoluteTime(owner.at)}</span>
              </>
            ) : (
              <span className="text-text-tertiary">Not yet given</span>
            )}
          </dd>
        </div>
        {review.pr_id && (
          <div>
            <dt className="text-text-tertiary">Pull request</dt>
            <dd className="text-text-primary mt-0.5">
              {review.pr_url ? (
                <a
                  href={review.pr_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  {prNumberFromUrl(review.pr_url) ? `#${prNumberFromUrl(review.pr_url)}` : 'View'} on GitHub
                  <ExternalLink size={11} aria-hidden />
                </a>
              ) : (
                <span>Dry run — recorded, not created on GitHub</span>
              )}
            </dd>
          </div>
        )}
      </dl>
      {review.require_distinct_approvers && (
        <p className="mt-3 pt-3 border-t border-border text-[11px] text-text-tertiary leading-relaxed">
          This workspace requires a different person for owner approval than for legal approval.
        </p>
      )}
    </section>
  )
}

export function SelfApprovedTag() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-sm border border-status-warning/30 bg-status-warning/10 font-mono text-[10px] uppercase tracking-wide text-status-warning"
      title="The same person gave legal and owner approval"
    >
      Self-approved
    </span>
  )
}

/** The audit record: every action, who took it, in which role, when. */
export function ReviewTimeline({ events }: { events: ReviewEvent[] }) {
  return (
    <section aria-labelledby="audit-record" className="rounded-md border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-2 px-4 sm:px-5 py-3 border-b border-border">
        <h2 id="audit-record" className="font-serif text-lg text-text-primary">
          Audit record
        </h2>
        <span className="font-mono text-[11px] text-text-tertiary">
          {events.length} {events.length === 1 ? 'entry' : 'entries'} · append-only
        </span>
      </div>
      {events.length === 0 ? (
        <p className="px-5 py-6 text-xs text-text-tertiary">No actions recorded yet.</p>
      ) : (
        <ol className="px-4 sm:px-5 py-4">
          {events.map((e, i) => (
            <li key={i} className="relative pl-6 pb-5 last:pb-0">
              {i < events.length - 1 && (
                <span className="absolute left-[5px] top-3 bottom-0 w-px bg-border" aria-hidden />
              )}
              <span
                className={`absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border-2 ${
                  e.action === 'pr_opened' || e.action === 'confirm'
                    ? 'border-status-compliant bg-status-compliant/20'
                    : e.action === 'send_back' || e.action === 'reject'
                      ? 'border-status-warning bg-status-warning/20'
                      : 'border-text-tertiary bg-surface'
                }`}
                aria-hidden
              />
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-3">
                <div className="text-xs text-text-primary min-w-0">
                  <span className="font-medium">{e.actor_name ?? 'Unknown'}</span>
                  {e.actor_role && (
                    <span className="ml-1.5 px-1 py-px rounded-sm border border-border font-mono text-[10px] uppercase text-text-tertiary align-middle">
                      {roleLabel(e.actor_role)}
                    </span>
                  )}
                  <span className="text-text-secondary"> — {eventSentence(e.action, e.to_state)}</span>
                </div>
                <time dateTime={e.at} className="font-mono text-[11px] text-text-tertiary whitespace-nowrap">
                  {absoluteTime(e.at)}
                </time>
              </div>
              {e.comment && e.action !== 'pr_opened' && (
                <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                  {e.comment}
                </blockquote>
              )}
              {e.action === 'pr_opened' && e.comment && (
                <div className="mt-1 text-[11px] font-mono text-text-tertiary break-all">
                  {e.comment === 'dry run' ? 'Dry run — not created on GitHub' : e.comment}
                </div>
              )}
              {e.from_state && e.to_state && e.from_state !== e.to_state && (
                <div className="mt-1 font-mono text-[10px] text-text-tertiary">
                  {stateName(e.from_state)} → {stateName(e.to_state)}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function stateName(s: string): string {
  return (REVIEW_STATE_LABELS as Record<string, string>)[s] ?? s.replace(/_/g, ' ')
}
