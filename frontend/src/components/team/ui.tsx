import type { ReactNode } from 'react'

/** Section heading used across Team and Settings: eyebrow + serif title. */
export function SectionHeading({
  eyebrow,
  title,
  action,
  id,
}: {
  eyebrow: string
  title: string
  action?: ReactNode
  id?: string
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary mb-0.5">{eyebrow}</div>
        <h2 id={id} className="text-[15px] font-medium text-text-primary">{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-border bg-surface ${className}`}>{children}</div>
}

export function InlineError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-[11px] leading-relaxed text-status-gap">
      {children}
    </p>
  )
}

export const inputClass =
  'bg-bg border border-border rounded px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors disabled:opacity-60'

export const buttonPrimary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-text-primary text-bg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer'

export const buttonSecondary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border text-text-secondary hover:text-text-primary hover:bg-bg disabled:opacity-50 transition-colors cursor-pointer'

export const buttonDanger =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-status-gap/40 bg-status-gap/10 text-status-gap hover:bg-status-gap/20 disabled:opacity-50 transition-colors cursor-pointer'

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** A labelled on/off switch. */
export function Toggle({
  id,
  checked,
  disabled,
  onChange,
  labelledBy,
  describedBy,
}: {
  id: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  labelledBy: string
  describedBy?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 cursor-pointer ${
        checked ? 'bg-text-primary border-text-primary' : 'bg-bg-subtle border-border-strong'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
          checked ? 'translate-x-[18px] bg-bg' : 'translate-x-[2px] bg-text-tertiary'
        }`}
      />
    </button>
  )
}
