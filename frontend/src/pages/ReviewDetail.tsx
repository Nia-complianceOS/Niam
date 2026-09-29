import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, BadgeCheck, FileText, Info, RotateCcw } from 'lucide-react'
import type { ReviewDetail as Review, ReviewDocument, ReviewVersion, WorkspaceRole } from '@/types/api'
import { useAuth } from '@/context/AuthContext'
import { useMyRole } from '@/hooks/useMyRole'
import { useSEO } from '@/hooks/useSEO'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { Prose } from '@/components/reviews/Prose'
import { RedlineView } from '@/components/reviews/RedlineView'
import { ReviewActions, currentVersion } from '@/components/reviews/ReviewActions'
import { ApprovalRecord, ReviewStepper, ReviewTimeline, SelfApprovedTag } from '@/components/reviews/ReviewRecord'
import { useReviewDetail, type ActBody, type ActOutcome } from '@/components/reviews/useReviewDetail'
import {
  canAct,
  REVIEW_STATE_LABELS,
  relativeTime,
  reviewStateTone,
  TONE_CHIP,
} from '@/components/reviews/reviewLanguage'
import { toast } from '@/lib/toast'

export default function ReviewDetail() {
  const { reviewId } = useParams<{ reviewId: string }>()
  const { user } = useAuth()
  const role = useMyRole()
  const { review, loading, error, busy, actionError, notice, clearMessages, act } = useReviewDetail(reviewId)
  const [editing, setEditing] = useState(false)

  useSEO({
    title: review?.gap_title ? `Review — ${review.gap_title}` : 'Fix review',
    description: 'Legal review and owner approval of a drafted compliance fix.',
  })

  // Leave the editor if the review moved on under us (someone else acted).
  useEffect(() => {
    if (review && review.state !== 'in_legal_review') setEditing(false)
  }, [review])

  if (loading) {
    return (
      <div className="max-w-[1280px] space-y-5">
        <BackLink />
        <div className="h-8 w-2/3 rounded bg-surface border border-border" />
        <TableSkeleton rows={4} />
      </div>
    )
  }

  if (error || !review) {
    return (
      <div className="max-w-[720px] space-y-5">
        <BackLink />
        <div className="rounded-md border border-border bg-surface p-6">
          <h1 className="font-serif text-title-lg text-text-primary">
            {error?.status === 404 ? 'Review not found' : 'Could not load this review'}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {error?.status === 404
              ? 'It may belong to a different workspace, or the link is wrong.'
              : error?.message ?? 'Unknown error.'}
          </p>
        </div>
      </div>
    )
  }

  const current = currentVersion(review)
  const canRetry = review.state === 'owner_approved' && canAct(review.state, 'open_pr', role).ok

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="max-w-[1280px] font-sans space-y-5"
    >
      <BackLink />

      {/* Header */}
      <header className="space-y-4 pb-5 border-b border-border">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase text-text-tertiary">
            <span>Fix review</span>
            <span className="text-border" aria-hidden>/</span>
            <span>
              {review.versions.length} version{review.versions.length === 1 ? '' : 's'}
            </span>
            <span className="text-border" aria-hidden>/</span>
            <span>Updated {relativeTime(review.updated_at)}</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-display-xl font-normal tracking-tight text-text-primary leading-tight break-words">
            <Link
              to={`/gaps?select=${encodeURIComponent(review.gap_id)}`}
              className="hover:underline underline-offset-4 decoration-1 decoration-text-tertiary"
              title="Open the finding"
            >
              {review.gap_title ?? 'Untitled finding'}
            </Link>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-sm border font-mono text-[11px] uppercase tracking-wide ${
                TONE_CHIP[review.last_error ? 'gap' : reviewStateTone(review.state)]
              }`}
            >
              {REVIEW_STATE_LABELS[review.state]}
            </span>
            {review.self_approved && <SelfApprovedTag />}
            {role && (
              <span className="font-mono text-[11px] text-text-tertiary">
                You: {role === 'owner' ? 'owner' : role === 'legal' ? 'legal reviewer' : 'member'}
              </span>
            )}
          </div>
        </div>
        <ReviewStepper review={review} />
      </header>

      {review.last_error && review.state === 'owner_approved' && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-md border border-status-gap/30 bg-status-gap/5 p-4"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-status-gap" aria-hidden />
            <div className="text-xs leading-relaxed min-w-0">
              <div className="font-medium text-text-primary">Approved, but the pull request did not open</div>
              <p className="text-text-secondary break-words">{review.last_error}</p>
            </div>
          </div>
          {canRetry && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                const res = await act({ action: 'open_pr' })
                if (res.ok && res.review?.state === 'pr_opened') toast.success('Pull request opened.')
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-text-primary text-bg text-xs font-medium hover:opacity-90 disabled:opacity-50 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary"
            >
              <RotateCcw size={13} aria-hidden />
              {busy === 'open_pr' ? 'Retrying…' : 'Retry'}
            </button>
          )}
        </div>
      )}

      {(notice || actionError) && (
        <div
          role="alert"
          className={`flex items-start justify-between gap-3 rounded-md border p-3 text-xs leading-relaxed ${
            notice ? 'border-status-warning/30 bg-status-warning/5' : 'border-status-gap/30 bg-status-gap/5'
          }`}
        >
          <span className="flex items-start gap-2 text-text-primary">
            <Info size={14} className={`mt-0.5 flex-shrink-0 ${notice ? 'text-status-warning' : 'text-status-gap'}`} aria-hidden />
            {notice ?? actionError}
          </span>
          <button
            type="button"
            onClick={clearMessages}
            className="text-text-tertiary hover:text-text-primary flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 space-y-4 lg:sticky lg:top-4">
          <ReviewActions
            review={review}
            role={role}
            myUserId={user?.id ?? null}
            busy={busy}
            editing={editing}
            onStartEdit={() => setEditing(true)}
            act={act}
          />
          <ApprovalRecord review={review} />
        </aside>

        <div className="lg:col-start-1 lg:row-start-1 min-w-0">
          {editing && current ? (
            <EditPanel
              version={current}
              busy={busy === 'edit'}
              onCancel={() => setEditing(false)}
              act={act}
              onSaved={() => setEditing(false)}
            />
          ) : (
            <DocumentPanel review={review} role={role} />
          )}
        </div>

        <div className="lg:col-start-1 lg:row-start-2 min-w-0">
          <ReviewTimeline events={review.events} />
        </div>
      </div>
    </motion.div>
  )
}

function BackLink() {
  return (
    <Link
      to="/reviews"
      className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
    >
      <ArrowLeft size={13} aria-hidden /> Legal Review
    </Link>
  )
}

// --- the document ----------------------------------------------------------

type Tab = 'read' | 'redline'

function DocumentPanel({ review, role }: { review: Review; role: WorkspaceRole | null }) {
  const versions = review.versions
  const current = currentVersion(review)
  const [tab, setTab] = useState<Tab>(versions.length > 1 ? 'redline' : 'read')
  const [viewId, setViewId] = useState<string | undefined>(current?.id)
  const [fromId, setFromId] = useState<string | undefined>()
  const [toId, setToId] = useState<string | undefined>()
  const tabBase = useId()

  // Defaults: read the current version; compare the one before it with it.
  // Reset whenever the set of versions changes (a new version arrived).
  useEffect(() => {
    const cur = currentVersion(review)
    const idx = cur ? versions.findIndex((v) => v.id === cur.id) : -1
    setViewId(cur?.id)
    setToId(cur?.id)
    setFromId(idx > 0 ? versions[idx - 1].id : undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions.length, review.current_version_id])

  const viewing = versions.find((v) => v.id === viewId) ?? current
  const from = versions.find((v) => v.id === fromId)
  const to = versions.find((v) => v.id === toId)
  const approvedId = review.approvals.legal?.version_id

  const selectVersion = (v: ReviewVersion) => {
    const idx = versions.findIndex((x) => x.id === v.id)
    setViewId(v.id)
    if (idx > 0) {
      setFromId(versions[idx - 1].id)
      setToId(v.id)
    }
  }

  return (
    <section className="rounded-md border border-border bg-surface" aria-label="Amendment">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 pt-3 border-b border-border">
        <div role="tablist" aria-label="Amendment view" className="flex gap-1 -mb-px">
          {(
            [
              ['read', 'Wording'],
              ['redline', 'Redline'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              id={`${tabBase}-${key}`}
              role="tab"
              type="button"
              aria-selected={tab === key}
              aria-controls={`${tabBase}-${key}-panel`}
              disabled={key === 'redline' && versions.length < 2}
              onClick={() => setTab(key)}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && versions.length > 1) {
                  const next = tab === 'read' ? 'redline' : 'read'
                  setTab(next)
                  document.getElementById(`${tabBase}-${next}`)?.focus()
                }
              }}
              tabIndex={tab === key ? 0 : -1}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary rounded-t ${
                tab === key
                  ? 'border-text-primary text-text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {label}
              {key === 'redline' && versions.length < 2 && <span className="sr-only"> (only one version)</span>}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-text-tertiary pb-2">
          {role === 'legal' || role === 'owner'
            ? review.state === 'in_legal_review'
              ? 'Editable at this stage'
              : 'Locked — approved or closed'
            : ''}
        </span>
      </div>

      <div className="p-4 sm:p-6">
        {tab === 'read' && viewing ? (
          <div id={`${tabBase}-read-panel`} role="tabpanel" aria-labelledby={`${tabBase}-read`}>
            <VersionView
              version={viewing}
              isCurrent={viewing.id === current?.id}
              isApproved={viewing.id === approvedId}
              onShowCurrent={() => setViewId(current?.id)}
            />
          </div>
        ) : tab === 'redline' ? (
          <div id={`${tabBase}-redline-panel`} role="tabpanel" aria-labelledby={`${tabBase}-redline`} className="space-y-4">
            <CompareControls versions={versions} fromId={fromId} toId={toId} onFrom={setFromId} onTo={setToId} />
            {from && to ? (
              from.id === to.id ? (
                <p className="text-xs text-text-tertiary">Choose two different versions to compare.</p>
              ) : (
                <RedlineView from={from} to={to} />
              )
            ) : (
              <p className="text-xs text-text-tertiary">Choose two versions to compare.</p>
            )}
          </div>
        ) : null}
      </div>

      <VersionHistory
        versions={versions}
        currentId={current?.id}
        approvedId={approvedId}
        selectedId={tab === 'read' ? viewing?.id : toId}
        onSelect={(v) => {
          selectVersion(v)
          const idx = versions.findIndex((x) => x.id === v.id)
          setTab(idx > 0 && tab === 'redline' ? 'redline' : 'read')
        }}
      />
    </section>
  )
}

function authorLine(v: ReviewVersion): string {
  if (v.author_kind === 'ai') return v.author_name?.includes('redo') ? 'AI redraft' : 'AI draft'
  return `Edited by ${v.author_name ?? 'a reviewer'}`
}

function VersionView({
  version,
  isCurrent,
  isApproved,
  onShowCurrent,
}: {
  version: ReviewVersion
  isCurrent: boolean
  isApproved: boolean
  onShowCurrent: () => void
}) {
  const warnings = version.analysis?.warnings ?? []
  return (
    <article className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-mono text-text-primary">Version {version.version_no}</span>
        <span className="text-text-secondary">{authorLine(version)}</span>
        <time dateTime={version.created_at} className="text-text-tertiary">
          {relativeTime(version.created_at)}
        </time>
        {isApproved && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-status-compliant/30 bg-status-compliant/10 font-mono text-[10px] uppercase text-status-compliant">
            <BadgeCheck size={11} aria-hidden /> Legal-approved
          </span>
        )}
        {!isCurrent && (
          <button
            type="button"
            onClick={onShowCurrent}
            className="ml-auto text-text-secondary underline underline-offset-4 hover:text-text-primary"
          >
            Earlier version — show current
          </button>
        )}
      </div>

      {version.instructions && (
        <div className="rounded border border-border bg-bg px-3 py-2 text-xs leading-relaxed text-text-secondary">
          <span className="text-text-tertiary">
            {version.author_kind === 'ai' ? 'Instructions to the AI: ' : 'Reviewer’s note: '}
          </span>
          {version.instructions}
        </div>
      )}

      {(warnings.length > 0 || version.analysis?.verified_citation) && (
        <ul className="space-y-1.5" aria-label="Advisory checks">
          {warnings.map((w, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-xs leading-relaxed text-text-primary"
            >
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-status-warning" aria-hidden />
              <span>
                <span className="font-medium text-status-warning">Advisory: </span>
                {w}
              </span>
            </li>
          ))}
          {version.analysis?.verified_citation && (
            <li className="flex items-center gap-2 text-[11px] text-status-compliant">
              <BadgeCheck size={13} aria-hidden /> Citations checked against the Act.
            </li>
          )}
          {warnings.length > 0 && (
            <li className="text-[11px] text-text-tertiary">
              Advisory checks never block approval; legal decides.
            </li>
          )}
        </ul>
      )}

      {version.documents.length === 0 && (
        <p className="text-xs text-text-tertiary">This version has no documents.</p>
      )}
      {version.documents.map((d, i) => (
        <DocumentView key={i} doc={d} />
      ))}
    </article>
  )
}

function DocumentView({ doc }: { doc: ReviewDocument }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FileText size={14} className="text-text-tertiary" aria-hidden />
        {doc.file_path ? (
          <span className="text-text-secondary">
            Will amend <span className="font-mono text-mono-code text-text-primary">{doc.file_path}</span>
          </span>
        ) : (
          <span className="text-text-tertiary">No file recorded for this amendment</span>
        )}
      </div>
      <div className="border-l-2 border-border pl-4 sm:pl-5">
        <h2 className="font-serif text-title-md font-medium text-text-primary mb-1">{doc.title}</h2>
        {doc.summary && <p className="text-xs text-text-secondary leading-relaxed mb-4 max-w-[68ch]">{doc.summary}</p>}
        <div className="max-w-[68ch]">
          <Prose markdown={doc.body} />
        </div>
      </div>
    </div>
  )
}

function CompareControls({
  versions,
  fromId,
  toId,
  onFrom,
  onTo,
}: {
  versions: ReviewVersion[]
  fromId?: string
  toId?: string
  onFrom: (id: string) => void
  onTo: (id: string) => void
}) {
  const base = useId()
  const cls =
    'rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-text-tertiary'
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
      <label htmlFor={`${base}-from`}>Compare</label>
      <select id={`${base}-from`} value={fromId ?? ''} onChange={(e) => onFrom(e.target.value)} className={cls}>
        <option value="" disabled>
          choose…
        </option>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version_no} — {authorLine(v)}
          </option>
        ))}
      </select>
      <label htmlFor={`${base}-to`}>with</label>
      <select id={`${base}-to`} value={toId ?? ''} onChange={(e) => onTo(e.target.value)} className={cls}>
        <option value="" disabled>
          choose…
        </option>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version_no} — {authorLine(v)}
          </option>
        ))}
      </select>
    </div>
  )
}

function VersionHistory({
  versions,
  currentId,
  approvedId,
  selectedId,
  onSelect,
}: {
  versions: ReviewVersion[]
  currentId?: string
  approvedId?: string | null
  selectedId?: string
  onSelect: (v: ReviewVersion) => void
}) {
  const ordered = useMemo(() => [...versions].reverse(), [versions])
  return (
    <div className="border-t border-border px-4 sm:px-5 py-4">
      <h2 className="font-mono text-eyebrow uppercase text-text-tertiary mb-2">Version history</h2>
      <ul className="divide-y divide-border">
        {ordered.map((v) => {
          const warnings = v.analysis?.warnings?.length ?? 0
          const selected = v.id === selectedId
          return (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onSelect(v)}
                aria-current={selected ? 'true' : undefined}
                className={`w-full text-left py-2.5 px-2 -mx-2 rounded flex items-start gap-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary ${
                  selected ? 'bg-bg' : 'hover:bg-bg'
                }`}
              >
                <span className={`font-mono text-xs w-7 flex-shrink-0 ${selected ? 'text-text-primary' : 'text-text-tertiary'}`}>
                  v{v.version_no}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="text-text-primary">{authorLine(v)}</span>
                    <span className="text-text-tertiary">{relativeTime(v.created_at)}</span>
                    {v.id === currentId && (
                      <span className="font-mono text-[10px] uppercase text-text-secondary border border-border rounded-sm px-1">
                        Current
                      </span>
                    )}
                    {v.id === approvedId && (
                      <span className="font-mono text-[10px] uppercase text-status-compliant border border-status-compliant/30 rounded-sm px-1">
                        Approved
                      </span>
                    )}
                    {warnings > 0 && (
                      <span className="font-mono text-[10px] uppercase text-status-warning">
                        {warnings} advisory
                      </span>
                    )}
                  </span>
                  {v.instructions && (
                    <span className="block text-[11px] text-text-tertiary truncate mt-0.5">“{v.instructions}”</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// --- editing -----------------------------------------------------------------

function EditPanel({
  version,
  busy,
  onCancel,
  onSaved,
  act,
}: {
  version: ReviewVersion
  busy: boolean
  onCancel: () => void
  onSaved: () => void
  act: (body: ActBody) => Promise<ActOutcome>
}) {
  const base = useId()
  const [bodies, setBodies] = useState<string[]>(() => version.documents.map((d) => d.body))
  const [note, setNote] = useState('')
  const changed = bodies.some((b, i) => b !== version.documents[i]?.body)

  const save = async () => {
    const res = await act({
      action: 'edit',
      comment: note.trim() || undefined,
      documents: version.documents.map((d, i) => ({ title: d.title, summary: d.summary, body: bodies[i] })),
    })
    if (res.ok && res.review) {
      const v = currentVersion(res.review)
      const n = v?.analysis?.warnings?.length ?? 0
      toast.success(
        `Saved as version ${v?.version_no}.${n ? ` ${n} advisory note${n === 1 ? '' : 's'} to look at.` : ''}`
      )
      onSaved()
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !changed) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, changed, onCancel])

  return (
    <section className="rounded-md border border-text-tertiary/40 bg-surface" aria-label="Edit wording">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (changed && !busy) void save()
        }}
      >
        <div className="px-4 sm:px-5 py-3 border-b border-border flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg text-text-primary">Edit wording</h2>
          <span className="font-mono text-[11px] text-text-tertiary">Starting from version {version.version_no}</span>
        </div>
        <div className="p-4 sm:p-5 space-y-5">
          <p className="text-xs leading-relaxed text-text-secondary max-w-[68ch]">
            Saving creates a new version; earlier versions are kept. Niam then runs advisory checks — does it
            still name the recipient and the data, does it promise retention or security measures the scan
            cannot evidence, does it cite sections this finding is not about. They never block approval.
          </p>
          {version.documents.map((d, i) => (
            <div key={i}>
              <label htmlFor={`${base}-doc-${i}`} className="block text-xs text-text-primary mb-1">
                {d.title}
                {d.file_path && <span className="ml-2 font-mono text-[11px] text-text-tertiary">{d.file_path}</span>}
              </label>
              <textarea
                id={`${base}-doc-${i}`}
                value={bodies[i]}
                onChange={(e) => setBodies((prev) => prev.map((b, j) => (j === i ? e.target.value : b)))}
                rows={Math.min(24, Math.max(10, (bodies[i] ?? '').split('\n').length + 2))}
                maxLength={20000}
                spellCheck
                className="w-full rounded border border-border bg-bg px-3 py-2.5 font-serif text-[15px] leading-relaxed text-text-primary focus:outline-none focus:border-text-tertiary"
              />
              <p className="mt-1 text-[11px] text-text-tertiary">
                Markdown: # heading, - list item, **bold**. {(bodies[i] ?? '').length.toLocaleString()} / 20,000
              </p>
            </div>
          ))}
          <div>
            <label htmlFor={`${base}-note`} className="block text-xs text-text-primary mb-1">
              Note for the record <span className="text-text-tertiary">(optional)</span>
            </label>
            <input
              id={`${base}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={4000}
              placeholder="e.g. Tightened the purpose statement; removed the unsupported retention period."
              className="w-full rounded border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary"
            />
          </div>
        </div>
        <div className="px-4 sm:px-5 py-3 border-t border-border flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3.5 py-2 rounded border border-border text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary"
          >
            Discard changes
          </button>
          <button
            type="submit"
            disabled={!changed || busy}
            aria-busy={busy}
            className="px-3.5 py-2 rounded bg-text-primary text-bg text-xs font-medium hover:opacity-90 disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary"
          >
            {busy ? 'Saving and checking…' : 'Save as new version'}
          </button>
        </div>
      </form>
    </section>
  )
}
