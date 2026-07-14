import { Card } from '@/components/ui/Card'

export default function AuditTrail() {
  return (
    <div className="max-w-[1280px]">
      <Card className="p-6">
        <h1 className="font-display text-[24px] font-semibold tracking-tight">Audit Trail</h1>
        <p className="mt-2 text-sm text-text-dim">Compliance audit history will appear here.</p>
      </Card>
    </div>
  )
}
