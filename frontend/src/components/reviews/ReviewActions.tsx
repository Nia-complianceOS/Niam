import { useEffect, useId, useState, type ReactNode } from 'react'
import { CheckCircle2, CornerUpLeft, GitPullRequest, PenLine, RotateCcw, ShieldOff, Sparkles } from 'lucide-react'
import type { ReviewDetail, ReviewVersion, WorkspaceRole } from '@/types/api'
import { toast } from '@/lib/toast'
import { ConfirmDialog } from './ConfirmDialog'
import { canAct, formatDay, isDryRunPr, prNumberFromUrl, relativeTime } from './reviewLanguage'
import type { ActBody, ActOutcome } from './useReviewDetail'

type Mode = null | 'approve' | 'redo' | 'not_required' | 'send_back' | 'reject'

interface Props {
  review: ReviewDetail
  role: WorkspaceRole | null
  myUserId: string | null
  busy: string | null
  editing: boolean
  onStartEdit: () => void
  act: (body: ActBody) => Promise<ActOutcome>
}

/**
 * What the signed-in person can do with this review, and only that.
 * Mirrors review_service.TRANSITIONS (via reviewLanguage.canAct); the
 * server re-checks every action.
 */
export function ReviewActions({ review, role, myUserId, busy, editing, onStartEdit, act }: Props) {
  const [mode, setMode] = useState<Mode>(null)
  const [confirm, setConfirm] = useState<null | 'owner_approve' | 'confirm'>(null)
  const current = currentVersion(review)
  const legal = review.approvals.legal
  const approvedVersion = review.versions.find((v) => v.id === legal?.version_id) ?? current

  // A different state means a different set of actions; drop any half-open form.
  useEffect(() => {
    setMode(null)
    setConfirm(null)
  }, [review.state])

  const run = async (body: ActBody, success: (r: ReviewDetail) => string | null) => {
    const res = await act(body)
    if (res.ok && res.review) {
      setMode(null)
      setConfirm(null)
      const msg = success(res.review)
      if (msg) toast.success(msg)
    }
    return res.ok
  }

  const prMessage = (r: ReviewDetail) => {
    if (r.state === 'pr_opened') {
      if (isDryRunPr(r.pr_id, r.pr_url)) {
        return 'Approved. Dry run: the pull request was recorded but not created on GitHub.'
      }
      const n = prNumberFromUrl(r.pr_url)
      return `Approved. Pull request${n ? ` #${n}` : ''} opened.`
    }
    if (r.last_error) return null // the banner explains
    return 'Approved.'
  }

  const heading = (
    <h2 className="font-mono text-eyebrow uppercase text-text-tertiary mb-3">Your action</h2>
  )

  // ---- Legal stage -------------------------------------------------------
  if (review.state === 'in_legal_review') {
    const allowed = canAct(review.state, 'approve', role)
    if (!allowed.ok) {
      return (
        <Panel>
          {heading}
          <Waiting title="Waiting on legal review">
            {allowed.reason} Legal can edit the wording, ask the AI to redo it, approve it, or mark it
            not required.
          </Waiting>
        </Panel>
      )
    }
    const disabled = busy !== null || editing
    return (
      <Panel>
        {heading}
        {role === 'owner' && (
          <p className="mb-3 text-[11px] leading-relaxed text-text-tertiary">
            You are acting as the legal reviewer. This is recorded; if you also give owner approval
            the review is labelled self-approved.
          </p>
        )}

        <div className="space-y-2">
          <ActionButton
            icon={<CheckCircle2 size={14} />}
            primary
            disabled={disabled}
            expanded={mode === 'approve'}
            onClick={() => setMode(mode === 'approve' ? null : 'approve')}
          >
            Approve v{current?.version_no} for owner sign-off
          </ActionButton>
          {mode === 'approve' && current && (
            <ApproveForm
              version={current}
              busy={busy === 'approve'}
              onCancel={() => setMode(null)}
              onSubmit={(comment) =>
                run({ action: 'approve', comment: comment || undefined }, () => 'Approved for owner sign-off.')
              }
            />
          )}

          <ActionButton
            icon={<PenLine size={14} />}
            disabled={disabled}
            onClick={() => {
              setMode(null)
              onStartEdit()
            }}
          >
            Edit wording
          </ActionButton>
          {editing && (
            <p className="text-[11px] text-text-tertiary pl-1">Editing in the document panel.</p>
          )}

          <ActionButton
            icon={<Sparkles size={14} />}
            disabled={disabled && busy !== 'redo'}
            expanded={mode === 'redo'}
            onClick={() => setMode(mode === 'redo' ? null : 'redo')}
          >
            Ask AI to redo
          </ActionButton>
          {(mode === 'redo' || busy === 'redo') && (
            <RedoForm
              busy={busy === 'redo'}
              onCancel={() => setMode(null)}
              onSubmit={(instructions) =>
                run({ action: 'redo', instructions }, (r) => `The AI produced version ${currentVersion(r)?.version_no}.`)
              }
            />
          )}

          <ActionButton
            icon={<ShieldOff size={14} />}
            disabled={disabled}
            expanded={mode === 'not_required'}
            onClick={() => setMode(mode === 'not_required' ? null : 'not_required')}
          >
            Not required
          </ActionButton>
          {mode === 'not_required' && (
            <NotRequiredForm
              busy={busy === 'not_required'}
              onCancel={() => setMode(null)}
              onSubmit={(outcome, reason, reviewBy) =>
                run(
                  { action: 'not_required', outcome, comment: reason, review_by: reviewBy || undefined },
                  () => 'Sent to the owner to confirm.'
                )
              }
            />
          )}
        </div>
      </Panel>
    )
  }

  // ---- Owner stage -------------------------------------------------------
  if (review.state === 'legal_approved') {
    const allowed = canAct(review.state, 'owner_approve', role)
    if (!allowed.ok) {
      return (
        <Panel>
          {heading}
          <Waiting title="Waiting on owner approval">
            {allowed.reason} On approval the pull request opens with version{' '}
            {approvedVersion?.version_no}.
          </Waiting>
        </Panel>
      )
    }
    const sameAsLegal = Boolean(legal?.user_id && myUserId && legal.user_id === myUserId)
    const blockedByPolicy = review.require_distinct_approvers && sameAsLegal
    const target = approvedVersion?.documents.map((d) => d.file_path).filter(Boolean).join(', ')

    return (
      <Panel>
        {heading}
        <p className="mb-3 text-xs leading-relaxed text-text-secondary">
          {legal ? `${legal.by} approved version ${legal.version_no ?? approvedVersion?.version_no} ${relativeTime(legal.at)}.` : 'Legal approved this version.'}{' '}
          Approving opens the pull request with that wording.
        </p>
        <div className="space-y-2">
          <ActionButton
            icon={<GitPullRequest size={14} />}
            primary
            disabled={busy !== null || blockedByPolicy}
            onClick={() => setConfirm('owner_approve')}
          >
            Approve and open pull request
          </ActionButton>
          {blockedByPolicy && (
            <p className="text-[11px] text-status-gap pl-1">
              You gave the legal approval, and this workspace requires a different person for owner
              approval.
            </p>
          )}
          <ActionButton
            icon={<CornerUpLeft size={14} />}
            disabled={busy !== null}
            expanded={mode === 'send_back'}
            onClick={() => setMode(mode === 'send_back' ? null : 'send_back')}
          >
            Send back to legal
          </ActionButton>
          {mode === 'send_back' && (
            <CommentForm
              label="What should legal change?"
              required
              submitLabel="Send back to legal"
              busy={busy === 'send_back'}
              onCancel={() => setMode(null)}
              onSubmit={(comment) => run({ action: 'send_back', comment }, () => 'Sent back to legal.')}
            />
          )}
        </div>

        <ConfirmDialog
          open={confirm === 'owner_approve'}
          title="Approve and open the pull request?"
          confirmLabel={busy === 'owner_approve' ? 'Opening…' : `Approve v${approvedVersion?.version_no} and open PR`}
          busy={busy === 'owner_approve'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run({ action: 'owner_approve' }, prMessage)}
        >
          <p>
            This gives owner approval to <strong className="text-text-primary">version {approvedVersion?.version_no}</strong>
            {legal ? `, approved by ${legal.by} for legal,` : ''} and immediately opens a pull request
            {target ? (
              <>
                {' '}amending <span className="font-mono text-[12px] text-text-primary">{target}</span>
              </>
            ) : null}{' '}
            with that exact wording.
          </p>
          <p>The pull request description carries the approval record: who approved, in which role, and when.</p>
          {sameAsLegal && (
            <p className="text-status-warning">
              You also gave the legal approval, so this review will be recorded as self-approved.
            </p>
          )}
          <p className="text-text-tertiary">
            If the server runs in dry-run mode, the pull request is recorded but not created on GitHub.
          </p>
        </ConfirmDialog>
      </Panel>
    )
  }

  // ---- Owner-approved, pull request not open ------------------------------
  if (review.state === 'owner_approved') {
    const allowed = canAct(review.state, 'open_pr', role)
    const canSendBack = canAct(review.state, 'send_back', role).ok
    return (
      <Panel>
        {heading}
        {allowed.ok ? (
          <>
            <p className="mb-3 text-xs leading-relaxed text-text-secondary">
              {review.last_error
                ? 'The fix is approved but GitHub refused the pull request. If that’s a one-off (permissions, GitHub being down), retry. If the draft itself needs to change, send it back to legal.'
                : 'The fix is approved; the pull request has not opened yet.'}
            </p>
            <div className="space-y-2">
              <ActionButton
                icon={<RotateCcw size={14} />}
                primary
                disabled={busy !== null}
                onClick={() => run({ action: 'open_pr' }, prMessage)}
              >
                {busy === 'open_pr' ? 'Opening pull request…' : 'Retry opening pull request'}
              </ActionButton>
              {canSendBack && review.last_error && (
                <ActionButton
                  icon={<CornerUpLeft size={14} />}
                  disabled={busy !== null}
                  expanded={mode === 'send_back'}
                  onClick={() => setMode(mode === 'send_back' ? null : 'send_back')}
                >
                  Send back to legal
                </ActionButton>
              )}
              {mode === 'send_back' && (
                <CommentForm
                  label="What needs to change?"
                  required
                  submitLabel="Send back to legal"
                  busy={busy === 'send_back'}
                  onCancel={() => setMode(null)}
                  onSubmit={(comment) => run({ action: 'send_back', comment }, () => 'Sent back to legal.')}
                />
              )}
            </div>
          </>
        ) : (
          <Waiting title="Approved — waiting on the owner">{allowed.reason} The owner can retry opening the pull request, or send it back to legal.</Waiting>
        )}
      </Panel>
    )
  }

  // ---- Not required: owner confirms or sends back -------------------------
  if (review.state === 'pending_owner_ack') {
    const allowed = canAct(review.state, 'confirm', role)
    const risk = review.proposed_outcome === 'risk_accepted'
    const proposal = (
      <div className="mb-3 rounded border border-border bg-bg p-3 text-xs leading-relaxed">
        <div className="font-medium text-text-primary">
          Legal proposes: {risk ? 'accept the risk' : 'dismiss the finding'}
        </div>
        {review.outcome_reason && <p className="mt-1 text-text-secondary">“{review.outcome_reason}”</p>}
        {risk && review.review_by && (
          <p className="mt-1 text-text-tertiary">Review again by {formatDay(review.review_by)}</p>
        )}
      </div>
    )
    if (!allowed.ok) {
      return (
        <Panel>
          {heading}
          {proposal}
          <Waiting title="Waiting on the owner to confirm">{allowed.reason}</Waiting>
        </Panel>
      )
    }
    return (
      <Panel>
        {heading}
        {proposal}
        <div className="space-y-2">
          <ActionButton
            icon={<CheckCircle2 size={14} />}
            primary
            disabled={busy !== null}
            onClick={() => setConfirm('confirm')}
          >
            {risk ? 'Confirm risk acceptance' : 'Confirm dismissal'}
          </ActionButton>
          <ActionButton
            icon={<CornerUpLeft size={14} />}
            disabled={busy !== null}
            expanded={mode === 'reject'}
            onClick={() => setMode(mode === 'reject' ? null : 'reject')}
          >
            Send back to legal
          </ActionButton>
          {mode === 'reject' && (
            <CommentForm
              label="Why should legal look again? (optional)"
              submitLabel="Send back to legal"
              busy={busy === 'reject'}
              onCancel={() => setMode(null)}
              onSubmit={(comment) => run({ action: 'reject', comment: comment || undefined }, () => 'Sent back to legal.')}
            />
          )}
        </div>
        <ConfirmDialog
          open={confirm === 'confirm'}
          title={risk ? 'Accept this risk?' : 'Dismiss this finding?'}
          confirmLabel={risk ? 'Confirm risk acceptance' : 'Confirm dismissal'}
          busy={busy === 'confirm'}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            run({ action: 'confirm' }, () => (risk ? 'Closed: risk accepted.' : 'Closed: finding dismissed.'))
          }
        >
          <p>
            {risk
              ? 'The finding stays true, but no change will be made. It closes as risk accepted'
              : 'The finding is recorded as wrong and closes with no change made'}
            {risk && review.review_by ? `, to be reviewed again by ${formatDay(review.review_by)}` : ''}.
          </p>
          {review.outcome_reason && <p>Reason given by legal: “{review.outcome_reason}”</p>}
          <p className="text-text-tertiary">A later scan will not reopen it. This is recorded in the audit record.</p>
        </ConfirmDialog>
      </Panel>
    )
  }

  // ---- Final -------------------------------------------------------------
  return (
    <Panel>
      <h2 className="font-mono text-eyebrow uppercase text-text-tertiary mb-3">Outcome</h2>
      {review.state === 'pr_opened' ? (
        <p className="text-xs leading-relaxed text-text-secondary">
          {isDryRunPr(review.pr_id, review.pr_url)
            ? 'Approved. The server is in dry-run mode, so the pull request was recorded but not created on GitHub.'
            : 'Approved and the pull request is open. Merging it follows the repository’s own process on GitHub.'}
        </p>
      ) : (
        <div className="text-xs leading-relaxed text-text-secondary space-y-1">
          <p className="font-medium text-text-primary">
            {review.state === 'risk_accepted'
              ? `Risk accepted${review.review_by ? ` — review again by ${formatDay(review.review_by)}` : ''}`
              : 'Dismissed — no change made'}
          </p>
          {review.outcome_reason && <p>“{review.outcome_reason}”</p>}
        </div>
      )}
    </Panel>
  )
}

export function currentVersion(r: ReviewDetail): ReviewVersion | undefined {
  return r.versions.find((v) => v.id === r.current_version_id) ?? r.versions[r.versions.length - 1]
}

// --- pieces -----------------------------------------------------------------

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-md border border-border bg-surface p-4">{children}</section>
}

function Waiting({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded border border-border bg-bg p-3 text-xs leading-relaxed">
      <div className="font-medium text-text-primary">{title}</div>
      <p className="mt-1 text-text-secondary">{children}</p>
    </div>
  )
}

function ActionButton({
  icon,
  children,
  primary = false,
  disabled,
  expanded,
  onClick,
}: {
  icon: ReactNode
  children: ReactNode
  primary?: boolean
  disabled?: boolean
  expanded?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-medium text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary ${
        primary
          ? 'bg-text-primary text-bg hover:opacity-90'
          : expanded
            ? 'border border-text-tertiary bg-bg text-text-primary'
            : 'border border-border text-text-primary hover:bg-bg'
      }`}
    >
      <span aria-hidden className="flex-shrink-0">
        {icon}
      </span>
      <span>{children}</span>
    </button>
  )
}

const FIELD =
  'w-full rounded border border-border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary'

function SubForm({ children, onSubmit }: { children: ReactNode; onSubmit: () => void }) {
  return (
    <form
      className="rounded border border-border bg-bg-subtle p-3 space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}

function FormButtons({
  submitLabel,
  busy,
  canSubmit,
  onCancel,
}: {
  submitLabel: string
  busy: boolean
  canSubmit: boolean
  onCancel: () => void
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="px-2.5 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy || !canSubmit}
        aria-busy={busy}
        className="px-3 py-1.5 rounded bg-text-primary text-bg text-xs font-medium hover:opacity-90 disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary"
      >
        {busy ? 'Working…' : submitLabel}
      </button>
    </div>
  )
}

function ApproveForm({
  version,
  busy,
  onCancel,
  onSubmit,
}: {
  version: ReviewVersion
  busy: boolean
  onCancel: () => void
  onSubmit: (comment: string) => void
}) {
  const id = useId()
  const [comment, setComment] = useState('')
  const warnings = version.analysis?.warnings ?? []
  return (
    <SubForm onSubmit={() => onSubmit(comment.trim())}>
      <p className="text-xs text-text-secondary leading-relaxed">
        You are approving the wording of <strong className="text-text-primary">version {version.version_no}</strong> as
        shown. The owner then decides whether to open the pull request with it.
      </p>
      {warnings.length > 0 && (
        <p className="text-[11px] text-status-warning leading-relaxed">
          This version has {warnings.length} advisory note{warnings.length === 1 ? '' : 's'}. They do not block approval.
        </p>
      )}
      <div>
        <label htmlFor={id} className="block text-[11px] text-text-tertiary mb-1">
          Note for the record (optional)
        </label>
        <textarea id={id} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className={FIELD} maxLength={4000} />
      </div>
      <FormButtons submitLabel={`Approve v${version.version_no}`} busy={busy} canSubmit onCancel={onCancel} />
    </SubForm>
  )
}

function RedoForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  onCancel: () => void
  onSubmit: (instructions: string) => void
}) {
  const id = useId()
  const [text, setText] = useState('')
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [busy])

  return (
    <SubForm onSubmit={() => onSubmit(text.trim())}>
      <div>
        <label htmlFor={id} className="block text-[11px] text-text-tertiary mb-1">
          Instructions to the AI
        </label>
        <textarea
          id={id}
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          maxLength={2000}
          placeholder="e.g. Name Mixpanel explicitly, drop the retention period, cite section 5 only."
          className={FIELD}
        />
      </div>
      {busy && (
        <div role="status" aria-live="polite" className="space-y-1.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-text-primary/60 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.min(95, (elapsed / 60) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-text-tertiary">
            Redrafting… {elapsed}s. This usually takes under a minute; keep this page open.
          </p>
        </div>
      )}
      <FormButtons submitLabel="Redo draft" busy={busy} canSubmit={text.trim().length > 0} onCancel={onCancel} />
    </SubForm>
  )
}

function NotRequiredForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  onCancel: () => void
  onSubmit: (outcome: 'dismissed' | 'risk_accepted', reason: string, reviewBy: string) => void
}) {
  const base = useId()
  const [outcome, setOutcome] = useState<'dismissed' | 'risk_accepted'>('dismissed')
  const [reason, setReason] = useState('')
  const [reviewBy, setReviewBy] = useState('')
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const valid = reason.trim().length > 0 && (outcome === 'dismissed' || reviewBy !== '')

  return (
    <SubForm onSubmit={() => valid && onSubmit(outcome, reason.trim(), outcome === 'risk_accepted' ? reviewBy : '')}>
      <fieldset>
        <legend className="text-[11px] text-text-tertiary mb-1.5">Why is no change needed?</legend>
        <div className="space-y-1.5">
          {(
            [
              ['dismissed', 'Dismiss', 'The finding is wrong.'],
              ['risk_accepted', 'Accept the risk', 'The finding is right, but the business accepts it for now.'],
            ] as const
          ).map(([value, label, help]) => (
            <label
              key={value}
              className={`flex items-start gap-2 rounded border px-2.5 py-2 text-xs cursor-pointer ${
                outcome === value ? 'border-text-tertiary bg-surface' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name={`${base}-outcome`}
                value={value}
                checked={outcome === value}
                onChange={() => setOutcome(value)}
                className="mt-0.5 accent-current"
              />
              <span>
                <span className="font-medium text-text-primary">{label}</span>
                <span className="block text-text-tertiary">{help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${base}-reason`} className="block text-[11px] text-text-tertiary mb-1">
          Reason (required)
        </label>
        <textarea
          id={`${base}-reason`}
          rows={3}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={4000}
          className={FIELD}
        />
      </div>
      {outcome === 'risk_accepted' && (
        <div>
          <label htmlFor={`${base}-date`} className="block text-[11px] text-text-tertiary mb-1">
            Review again by (required)
          </label>
          <input
            id={`${base}-date`}
            type="date"
            required
            min={tomorrow}
            value={reviewBy}
            onChange={(e) => setReviewBy(e.target.value)}
            className={FIELD}
          />
        </div>
      )}
      <p className="text-[11px] text-text-tertiary">The owner confirms this before the finding closes.</p>
      <FormButtons submitLabel="Send to owner" busy={busy} canSubmit={valid} onCancel={onCancel} />
    </SubForm>
  )
}

function CommentForm({
  label,
  required = false,
  submitLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  label: string
  required?: boolean
  submitLabel: string
  busy: boolean
  onCancel: () => void
  onSubmit: (comment: string) => void
}) {
  const id = useId()
  const [comment, setComment] = useState('')
  return (
    <SubForm onSubmit={() => onSubmit(comment.trim())}>
      <div>
        <label htmlFor={id} className="block text-[11px] text-text-tertiary mb-1">
          {label}
        </label>
        <textarea
          id={id}
          rows={3}
          required={required}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={4000}
          className={FIELD}
        />
      </div>
      <FormButtons
        submitLabel={submitLabel}
        busy={busy}
        canSubmit={!required || comment.trim().length > 0}
        onCancel={onCancel}
      />
    </SubForm>
  )
}
