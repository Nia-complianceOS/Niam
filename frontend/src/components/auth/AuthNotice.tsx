import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'

type Tone = 'error' | 'success' | 'info'

const TONES: Record<Tone, { box: string; icon: typeof Info; text: string }> = {
  error: { box: 'border-status-gap/30 bg-status-gap/10', icon: AlertTriangle, text: 'text-status-gap' },
  success: { box: 'border-status-compliant/30 bg-status-compliant/10', icon: CheckCircle2, text: 'text-status-compliant' },
  info: { box: 'border-border bg-bg-subtle', icon: Info, text: 'text-text-secondary' },
}

/** A titled message box for the sign-in, invite and GitHub completion pages. */
export function AuthNotice({
  tone = 'error',
  title,
  children,
}: {
  tone?: Tone
  title?: string
  children: ReactNode
}) {
  const t = TONES[tone]
  const Icon = t.icon
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`p-3 rounded border text-xs leading-relaxed flex items-start gap-2.5 ${t.box}`}
    >
      <Icon size={14} strokeWidth={2} className={`mt-0.5 flex-shrink-0 ${t.text}`} aria-hidden="true" />
      <div className="min-w-0">
        {title && <div className={`font-medium mb-0.5 ${t.text}`}>{title}</div>}
        <div className="text-text-secondary">{children}</div>
      </div>
    </div>
  )
}
