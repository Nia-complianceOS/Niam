import { Card } from '@/components/ui/Card'
import { Link } from 'react-router-dom'
import type { StatCard as StatCardData } from '@/types/api'

const TONE_CLASSES: Record<StatCardData['sub_tone'], string> = {
  good: 'text-accent-green',
  warn: 'text-accent-amber',
  neutral: 'text-text-faint',
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
  // (see dashboard_service.py's "Connected Vendors" card falling back when
  // Neo4j is down). Dimming it here — rather than rendering it the same
  // bright weight as a real number — makes it read as "unavailable right
  // now", not as a broken/undefined value next to the other three cards.
  const isUnavailable = value === '—'

  const content = (
    <>
      <div className="text-xs text-text-dim font-medium mb-2.5">{label}</div>
      <div className={`font-display text-[30px] font-semibold tracking-tight ${isUnavailable ? 'text-text-faint' : ''}`}>
        {value}
      </div>
      {sub_label && <div className={`text-xs mt-1 ${TONE_CLASSES[sub_tone]}`}>{sub_label}</div>}
      {score_explanation && (
        <div className="text-[11px] text-text-faint mt-2 leading-relaxed">
          {score_explanation}
        </div>
      )}
    </>
  )

  const cardClasses = "p-[18px_20px] transition-all hover:border-white/[0.16] hover:-translate-y-0.5 block h-full"

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