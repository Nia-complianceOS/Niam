import { Card } from '@/components/ui/Card'
import { Link } from 'react-router-dom'
import type { StatCard as StatCardData } from '@/types/api'

const TONE_CLASSES: Record<StatCardData['sub_tone'], string> = {
  good: 'text-status-compliant',
  warn: 'text-warning',
  neutral: 'text-text-muted',
}

export function StatCard({
  label,
  value,
  sub_label,
  sub_tone,
  score_explanation,
  to
}: StatCardData & { to?: string }) {
  // Backend sends "—" as the value when a stat's data source is unreachable
  const isUnavailable = value === '—'

  const content = (
    <>
      <div className="text-[11px] font-mono text-text-muted uppercase tracking-wider mb-2">{label}</div>
      <div className={`font-serif text-3xl font-normal tracking-tight text-text-primary ${isUnavailable ? 'text-text-muted italic' : ''}`}>
        {value}
      </div>
      {sub_label && <div className={`text-xs mt-1.5 font-mono ${TONE_CLASSES[sub_tone]}`}>{sub_label}</div>}
      {score_explanation && (
        <div className="text-xs text-text-secondary mt-2 leading-relaxed font-sans">
          {score_explanation}
        </div>
      )}
    </>
  )

  const cardClasses = "p-5 transition-all hover:border-border-strong block h-full border-border bg-surface"

  if (to && !isUnavailable) {
    return (
      <Link to={to} className="block h-full outline-none">
        <Card className={cardClasses}>{content}</Card>
      </Link>
    )
  }

  return (
    <Card className={cardClasses}>{content}</Card>
  )
}