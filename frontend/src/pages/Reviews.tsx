import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { ReviewSummary } from '@/types/api'
import { getReviews } from '@/services/api/client'
import { useAsync } from '@/hooks/useAsync'
import { useMyRole } from '@/hooks/useMyRole'
import { useSEO } from '@/hooks/useSEO'
import { ErrorState, PageHeader } from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { SelfApprovedTag } from '@/components/reviews/ReviewRecord'
import {
  formatDay,
  isDryRunPr,
  prNumberFromUrl,
  REVIEW_STATE_LABELS,
  relativeTime,
  reviewQueue,
  reviewStateTone,
  TONE_CHIP,
  type Queue,
} from '@/components/reviews/reviewLanguage'

const TABS: { key: Queue; label: string; empty: { title: string; body: string; link?: boolean } }[] = [
  {
    key: 'legal',
    label: 'Waiting on legal',
    empty: {
      title: 'Nothing is waiting for legal review.',
      body: 'Draft a fix from a finding to start one.',
      link: true,
    },
  },
  {
    key: 'owner',
    label: 'Waiting on owner',
    empty: {
      title: 'Nothing is waiting for owner approval.',
      body: 'Fixes appear here once legal approves them, or marks them not required.',
    },
  },
  {
    key: 'closed',
    label: 'Closed',
    empty: {
      title: 'No closed reviews yet.',
      body: 'Reviews close when the pull request opens, or when the owner confirms a finding is dismissed or its risk accepted.',
    },
  },
]

export default function Reviews() {
  useSEO({
    title: 'Legal Review — Niam',
    description: 'Drafted compliance fixes awaiting legal review and owner approval.',
  })
  const role = useMyRole()
  const { data, loading, error } = useAsync(() => getReviews())
  const reviews = useMemo(() => data ?? [], [data])
  const grouped = useMemo(() => {
    const g: Record<Queue, ReviewSummary[]> = { legal: [], owner: [], closed: [] }
    for (const r of reviews) g[reviewQueue(r)].push(r)
    return g
  }, [reviews])

  const [tab, setTab] = useState<Queue | null>(null)
  const chosenRef = useRef(false)
  const tabBase = useId()

  // Default tab by role, once both the role and the list are known. The
  // person's own click always wins after that.
  useEffect(() => {
    if (chosenRef.current || loading || !data || role === null) return
    if (role === 'owner') setTab(grouped.owner.length > 0 ? 'owner' : 'legal')
    else setTab('legal')
  }, [role, loading, data, grouped])

  const active: Queue = tab ?? 'legal'
  const rows = grouped[active]
  const activeTab = TABS.find((t) => t.key === active)!

  const header = (
    <PageHeader
      eyebrow="Two-stage approval"
      title="Legal Review"
      subtitle="Every drafted fix is reviewed by legal, then approved by the owner. The pull request opens only on owner approval, carrying the approval record."
    />
  )

  if (error) {
    return (
      <div className="max-w-[1100px]">
        {header}
        <ErrorState message={error} />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="max-w-[1100px] font-sans"
    >
      {header}

      <div role="tablist" aria-label="Review queues" className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        {TABS.map((t, i) => {
          const selected = t.key === active
          const count = grouped[t.key].length
          return (
            <button
              key={t.key}
              id={`${tabBase}-${t.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${tabBase}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                chosenRef.current = true
                setTab(t.key)
              }}
              onKeyDown={(e) => {
                const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                if (!dir) return
                e.preventDefault()
                const next = TABS[(i + dir + TABS.length) % TABS.length].key
                chosenRef.current = true
                setTab(next)
                document.getElementById(`${tabBase}-${next}`)?.focus()
              }}
              className={`-mb-px flex items-center gap-2 whitespace-nowrap px-3 py-2 text-xs font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-text-tertiary rounded-t ${
                selected
                  ? 'border-text-primary text-text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {t.label}
              {!loading && (
                <span
                  className={`min-w-[18px] px-1 rounded-sm font-mono text-[10px] text-center ${
                    count > 0 && t.key !== 'closed'
                      ? 'bg-status-warning/15 text-status-warning'
                      : 'bg-bg-subtle text-text-tertiary'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div id={`${tabBase}-panel`} role="tabpanel" aria-labelledby={`${tabBase}-${active}`}>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-border bg-surface px-5 py-8">
            <p className="font-serif text-lg text-text-primary">{activeTab.empty.title}</p>
            <p className="mt-1 text-sm text-text-secondary max-w-[560px]">{activeTab.empty.body}</p>
            {activeTab.empty.link && (
              <Link
                to="/gaps"
                className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded border border-border text-xs font-medium text-text-primary hover:bg-bg transition-colors"
              >
                Go to Compliance Gaps <ArrowRight size={12} aria-hidden />
              </Link>
            )}
          </div>
        ) : (
          <ul className="rounded-md border border-border bg-surface divide-y divide-border">
            {rows.map((r) => (
              <ReviewRow key={r.id} review={r} />
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  )
}

function ReviewRow({ review: r }: { review: ReviewSummary }) {
  const { legal, owner } = r.approvals
  const tone = r.last_error ? 'gap' : reviewStateTone(r.state)
  const who: string[] = []
  if (legal) who.push(`Legal: ${legal.by}${legal.version_no ? ` (v${legal.version_no})` : ''}`)
  if (owner) who.push(`Owner: ${owner.by}`)

  let outcome: string | null = null
  if (r.state === 'pr_opened') {
    const n = prNumberFromUrl(r.pr_url)
    outcome = isDryRunPr(r.pr_id, r.pr_url) ? 'Dry-run pull request' : n ? `Pull request #${n}` : 'Pull request opened'
  } else if (r.state === 'risk_accepted' && r.review_by) {
    outcome = `Review again by ${formatDay(r.review_by)}`
  } else if (r.state === 'pending_owner_ack') {
    outcome = r.proposed_outcome === 'risk_accepted' ? 'Proposes: accept the risk' : 'Proposes: dismiss'
  }

  return (
    <li>
      <Link
        to={`/reviews/${r.id}`}
        className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 hover:bg-bg transition-colors focus:outline-none focus-visible:bg-bg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-tertiary"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-text-primary group-hover:underline underline-offset-4 decoration-text-tertiary break-words">
            {r.gap_title ?? 'Untitled finding'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
            {who.length > 0 ? <span>{who.join(' · ')}</span> : <span>No approvals yet</span>}
            {outcome && <span className="text-text-secondary">{outcome}</span>}
            {r.outcome_reason && (r.state === 'dismissed' || r.state === 'risk_accepted' || r.state === 'pending_owner_ack') && (
              <span className="truncate max-w-[40ch]" title={r.outcome_reason}>
                “{r.outcome_reason}”
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:flex-shrink-0">
          {r.last_error && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-status-gap/30 bg-status-gap/10 font-mono text-[10px] uppercase text-status-gap"
              title={r.last_error}
            >
              <AlertTriangle size={10} aria-hidden /> PR failed
            </span>
          )}
          {r.self_approved && <SelfApprovedTag />}
          <span className={`px-1.5 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wide ${TONE_CHIP[tone]}`}>
            {REVIEW_STATE_LABELS[r.state]}
          </span>
          <time dateTime={r.updated_at} className="font-mono text-[11px] text-text-tertiary whitespace-nowrap w-[88px] sm:text-right">
            {relativeTime(r.updated_at)}
          </time>
        </div>
      </Link>
    </li>
  )
}
