import type {
  ReviewAction,
  ReviewState,
  ReviewSummary,
  WorkspaceRole,
} from '@/types/api'

/**
 * The review workflow in the reader's words, and the client's copy of the
 * server's transition table (backend/app/services/review_service.py,
 * TRANSITIONS). The server is authoritative; this copy only decides which
 * buttons to show and what to say when one is not available.
 */

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  in_legal_review: 'With legal review',
  legal_approved: 'Awaiting owner approval',
  owner_approved: 'Approved — pull request not yet open',
  pr_opened: 'Pull request opened',
  pending_owner_ack: 'Not required — awaiting owner',
  dismissed: 'Dismissed',
  risk_accepted: 'Risk accepted',
}

export type Tone = 'warning' | 'neutral' | 'compliant' | 'gap'

export function reviewStateTone(state: ReviewState): Tone {
  switch (state) {
    case 'in_legal_review':
    case 'legal_approved':
    case 'pending_owner_ack':
      return 'warning'
    case 'owner_approved':
      return 'warning'
    case 'pr_opened':
      return 'compliant'
    case 'dismissed':
    case 'risk_accepted':
      return 'neutral'
  }
}

export const TONE_CHIP: Record<Tone, string> = {
  warning: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  neutral: 'border-border bg-bg-subtle text-text-secondary',
  compliant: 'border-status-compliant/30 bg-status-compliant/10 text-status-compliant',
  gap: 'border-status-gap/30 bg-status-gap/10 text-status-gap',
}

export type Queue = 'legal' | 'owner' | 'closed'

/** Which queue a review sits in on /reviews. */
export function reviewQueue(r: Pick<ReviewSummary, 'state'>): Queue {
  switch (r.state) {
    case 'in_legal_review':
      return 'legal'
    case 'legal_approved':
    case 'owner_approved':
    case 'pending_owner_ack':
      return 'owner'
    default:
      return 'closed'
  }
}

type Role = WorkspaceRole

/** Mirror of TRANSITIONS: (state, action) -> roles allowed. */
const TRANSITIONS: Partial<Record<ReviewState, Partial<Record<ReviewAction, Role[]>>>> = {
  in_legal_review: {
    edit: ['legal', 'owner'],
    redo: ['legal', 'owner'],
    approve: ['legal', 'owner'],
    not_required: ['legal', 'owner'],
  },
  legal_approved: { owner_approve: ['owner'], send_back: ['owner'] },
  owner_approved: { open_pr: ['owner'], send_back: ['owner'] },
  pending_owner_ack: { confirm: ['owner'], reject: ['owner'] },
}

export type Availability =
  | { ok: true }
  | { ok: false; reason: string }

/** Can `role` take `action` in `state`? With a sentence if not. */
export function canAct(state: ReviewState, action: ReviewAction, role: Role | null): Availability {
  const roles = TRANSITIONS[state]?.[action]
  if (!roles) return { ok: false, reason: 'Not possible at this stage.' }
  if (role === null) return { ok: false, reason: 'Checking your role…' }
  if (roles.includes(role)) return { ok: true }
  if (roles.length === 1 && roles[0] === 'owner') {
    return { ok: false, reason: 'Only the workspace owner can do this.' }
  }
  return { ok: false, reason: 'Only legal reviewers (or the owner) can do this.' }
}

/** Plain words for each event in the audit timeline. */
export function eventSentence(action: string, toState: string | null): string {
  switch (action) {
    case 'submitted':
      return 'Sent the AI draft to legal review'
    case 'edit':
      return 'Edited the wording (new version)'
    case 'redo':
      return 'Asked the AI to redo the draft'
    case 'approve':
      return 'Approved for owner sign-off'
    case 'not_required':
      return 'Marked the fix not required'
    case 'owner_approve':
      return 'Gave owner approval'
    case 'send_back':
      return 'Sent back to legal'
    case 'confirm':
      return toState === 'risk_accepted'
        ? 'Confirmed: risk accepted, no change made'
        : 'Confirmed: finding dismissed, no change made'
    case 'reject':
      return 'Rejected the not-required decision; back to legal'
    case 'pr_opened':
      return 'Pull request opened'
    case 'open_pr':
      return 'Retried opening the pull request'
    default:
      return action.replace(/_/g, ' ')
  }
}

export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'owner':
      return 'Owner'
    case 'legal':
      return 'Legal'
    case 'member':
      return 'Member'
    default:
      return role ?? ''
  }
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const sec = Math.round((t - now) / 1000)
  const abs = Math.abs(sec)
  if (abs < 45) return 'just now'
  if (abs < 3600) return RTF.format(Math.round(sec / 60), 'minute')
  if (abs < 86400) return RTF.format(Math.round(sec / 3600), 'hour')
  if (abs < 86400 * 30) return RTF.format(Math.round(sec / 86400), 'day')
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "25 Sep 2026, 14:03" -- for the audit record, always absolute. */
export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** A date-only value (YYYY-MM-DD) shown without a timezone shift. */
export function formatDay(day: string | null | undefined): string {
  if (!day) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!m) return day
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function prNumberFromUrl(url: string | null | undefined): number | null {
  const m = url ? /\/pull\/(\d+)/.exec(url) : null
  return m ? Number(m[1]) : null
}

export function isDryRunPr(prId: string | null | undefined, prUrl: string | null | undefined): boolean {
  return Boolean(prId && !prUrl) || Boolean(prId?.startsWith('pr-dryrun'))
}
