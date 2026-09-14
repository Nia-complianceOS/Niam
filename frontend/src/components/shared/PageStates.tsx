import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="max-w-[1280px] flex items-center justify-center h-[50vh] text-text-muted text-xs font-mono tracking-wide">
      <span className="inline-block w-2 h-2 rounded-full bg-accent-clause animate-pulse mr-2.5" />
      {label}
    </div>
  )
}

export function ErrorState({ message }: { message: string | null }) {
  return (
    <div className="max-w-[1280px]">
      <Card className="p-6 border-danger/30 bg-danger/5">
        <div className="text-danger font-mono text-xs font-semibold uppercase tracking-wider mb-1">Backend Connection Failure</div>
        <div className="text-text-secondary text-sm font-sans">{message || 'Unable to establish communication with regulatory API server.'}</div>
      </Card>
    </div>
  )
}

/**
 * For the "request succeeded, there's just nothing there yet" case.
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
    <Card className="p-8 border-border bg-surface">
      <div className="font-serif text-lg font-normal text-text-primary mb-1.5">{title}</div>
      <div className="text-text-secondary text-sm max-w-[560px] leading-relaxed font-sans">{message}</div>
      {children}
      {action && (
        <Link
          to={action.to}
          className="inline-flex items-center gap-2 mt-5 px-3.5 py-1.5 rounded border border-border-strong bg-surface text-text-primary hover:bg-surface-raised text-xs font-medium transition-colors"
        >
          {action.label} <ArrowRight size={13} className="text-text-muted" />
        </Link>
      )}
    </Card>
  )
}

/**
 * The empty state for a brand-new account.
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
      action={{ label: 'Connect Source Repository', to: '/repositories' }}
    >
      {detail && (
        <div className="mt-3 text-xs font-mono text-text-muted bg-surface-sunken border border-border-subtle rounded p-3 max-w-[560px] leading-relaxed">
          {detail}
        </div>
      )}
    </EmptyState>
  )
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-8 border-b border-border-subtle pb-5">
      <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider text-text-muted uppercase mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-status-compliant" />
        {eyebrow}
      </div>
      <h1 className="font-serif text-2xl md:text-3xl font-normal text-text-primary tracking-tight">{title}</h1>
      <div className="text-text-secondary text-sm mt-1.5 max-w-[620px] font-sans leading-relaxed">{subtitle}</div>
    </div>
  )
}
