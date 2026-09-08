import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="max-w-[1280px] flex items-center justify-center h-[60vh] text-text-dim text-sm font-mono">
      {label}
    </div>
  )
}

export function ErrorState({ message }: { message: string | null }) {
  return (
    <div className="max-w-[1280px]">
      <Card className="p-6 border-accent-red/30">
        <div className="text-accent-red font-semibold mb-1">Couldn't reach the backend</div>
        <div className="text-text-dim text-sm">{message}</div>
      </Card>
    </div>
  )
}

/**
 * For the "request succeeded, there's just nothing there yet" case —
 * distinct from ErrorState. Used when a backend/graph call returns 200
 * with an empty list/graph (e.g. no repos connected yet, no vendors
 * ingested yet, or a fresh Neo4j instance with no nodes written).
 *
 * An empty state that only says "nothing here" leaves a new account
 * stranded, so it takes an optional action: one link to the single next
 * thing that would fill the page. `GetStartedState` below is that link,
 * pre-written, for every page whose data begins with a scan.
 */
export function EmptyState({
  title,
  message,
  action,
  children,
}: {
  title: string
  message: string
  action?: { label: string; to: string }
  children?: ReactNode
}) {
  return (
    <Card className="p-6 border-white/5">
      <div className="font-semibold mb-1">{title}</div>
      <div className="text-text-dim text-sm max-w-[560px] leading-relaxed">{message}</div>
      {children}
      {action && (
        <Link
          to={action.to}
          className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-2 rounded-[10px] bg-grad-primary text-white text-[13px] font-semibold shadow-[0_4px_18px_rgba(91,140,255,0.28)] hover:-translate-y-px hover:shadow-[0_6px_22px_rgba(91,140,255,0.4)] transition-all"
        >
          {action.label} <ArrowRight size={14} />
        </Link>
      )}
    </Card>
  )
}

/**
 * The empty state for a brand-new account.
 *
 * Every page in this app is downstream of one action: connect GitHub, then
 * scan a repository. Until that happens there is genuinely nothing to
 * show, and each page used to say so in its own words — or worse, show a
 * spinner that never resolved into anything, or a dashboard of zeros that
 * read as "we checked, you are fine". This says the same true thing
 * everywhere and points at the one door.
 *
 * `detail` carries the backend's own explanation when it sends one (the
 * score is null with a sentence saying why). That sentence is rendered as
 * written; it is never replaced with a number.
 */
export function GetStartedState({
  title,
  message,
  detail,
}: {
  title: string
  message: string
  detail?: string | null
}) {
  return (
    <EmptyState
      title={title}
      message={message}
      action={{ label: 'Connect GitHub', to: '/repositories' }}
    >
      {detail && (
        <div className="mt-3 text-[12.5px] text-text-faint bg-black/30 border border-border-soft rounded-[10px] px-3.5 py-2.5 max-w-[560px] leading-relaxed">
          {detail}
        </div>
      )}
    </EmptyState>
  )
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-blue uppercase tracking-wide mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-green" style={{ boxShadow: '0 0 8px #33d17a' }} />
        {eyebrow}
      </div>
      <h1 className="font-display text-[28px] font-semibold tracking-tight">{title}</h1>
      <div className="text-text-dim text-sm mt-1.5 max-w-[560px]">{subtitle}</div>
    </div>
  )
}
