import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import type { Policy } from '@/types/api'

export function PolicyCard({ policy }: { policy: Policy }) {
  return (
    <Card className="p-5 transition-all hover:border-white/[0.16] hover:-translate-y-0.5">
      <div className="flex justify-between items-start mb-3.5">
        <div className="font-display text-[15.5px] font-semibold">{policy.name}</div>
        <StatusBadge status={policy.status}>{policy.status_label}</StatusBadge>
      </div>
      <div className="text-[13px] text-text-dim leading-relaxed">{policy.description}</div>
      <div className="h-1.5 rounded-md bg-white/[0.06] overflow-hidden mt-3">
        <div className="h-full rounded-md bg-grad-primary" style={{ width: `${policy.coverage_percent}%` }} />
      </div>
    </Card>
  )
}