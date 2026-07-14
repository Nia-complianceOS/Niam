import { Card } from '@/components/ui/Card'
import type { AuditEvent } from '@/types/api'

const EVENT_ICON: Record<string, string> = {
  commit_detected: '🔀',
  policy_updated: '📄',
  vendor_added: '🏷️',
  consent_changed: '🍪',
  retention_updated: '🗄️',
  pr_merged: '✅',
}

export function AuditEventList({ events }: { events: AuditEvent[] }) {
  return (
    <Card className="p-5">
      {events.map((event) => (
        <div key={event.id} className="flex gap-4 py-3.5 border-b border-border-soft last:border-b-0">
          <div className="font-mono text-[11.5px] text-text-faint w-[150px] flex-shrink-0 pt-0.5">
            {new Date(event.occurred_at).toLocaleString()}
          </div>
          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-xs flex-shrink-0">
            {EVENT_ICON[event.event_type] ?? '•'}
          </div>
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold">{event.title}</div>
            {event.description && <div className="text-xs text-text-dim mt-0.5">{event.description}</div>}
            <div className="text-[11px] text-text-faint mt-1.5">{event.actor}</div>
          </div>
        </div>
      ))}
    </Card>
  )
}