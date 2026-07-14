import { Card } from '@/components/ui/Card'
import type { StatCard as StatCardData } from '@/types/api'

const TONE_CLASSES: Record<StatCardData['sub_tone'], string> = {
  good: 'text-accent-green',
  warn: 'text-accent-amber',
  neutral: 'text-text-faint',
}

export function StatCard({ label, value, sub_label, sub_tone }: StatCardData) {
  return (
    <Card className="p-[18px_20px] transition-all hover:border-white/[0.16] hover:-translate-y-0.5">
      <div className="text-xs text-text-dim font-medium mb-2.5">{label}</div>
      <div className="font-display text-[30px] font-semibold tracking-tight">{value}</div>
      {sub_label && <div className={`text-xs mt-1 ${TONE_CLASSES[sub_tone]}`}>{sub_label}</div>}
    </Card>
  )
}