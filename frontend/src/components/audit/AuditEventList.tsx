import type { AuditEvent } from '@/types/api'
import { GitCommit, FileText, Tags, Cookie, Database, CheckCircle2, User } from 'lucide-react'

const EVENT_ICON: Record<string, { icon: any, color: string }> = {
  commit_detected: { icon: GitCommit, color: 'text-accent-blue' },
  policy_updated: { icon: FileText, color: 'text-accent-purple' },
  vendor_added: { icon: Tags, color: 'text-accent-amber' },
  consent_changed: { icon: Cookie, color: 'text-accent-amber' },
  retention_updated: { icon: Database, color: 'text-accent-blue' },
  pr_merged: { icon: CheckCircle2, color: 'text-accent-green' },
}

export function AuditEventList({ events }: { events: AuditEvent[] }) {
  // Group by date
  const groupedEvents: Record<string, AuditEvent[]> = {}
  
  events.forEach((event) => {
    const d = new Date(event.occurred_at)
    // Check if today or yesterday
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    let dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    if (d.toDateString() === today.toDateString()) {
      dateStr = 'Today'
    } else if (d.toDateString() === yesterday.toDateString()) {
      dateStr = 'Yesterday'
    }
    
    if (!groupedEvents[dateStr]) groupedEvents[dateStr] = []
    groupedEvents[dateStr].push(event)
  })

  const dates = Object.keys(groupedEvents)

  return (
    <div className="w-full max-w-[800px] mt-8 pl-4 sm:pl-8">
      {dates.map((date, idx) => (
        <div key={date} className="relative mb-8">
          <div className="sticky top-[80px] z-10 bg-[#0a0a0c]/90 backdrop-blur py-2 -mx-4 px-4 sm:-mx-8 sm:px-8">
            <h3 className="text-[13px] font-bold tracking-widest text-text-faint uppercase">{date}</h3>
          </div>
          
          <div className="mt-4 space-y-6">
            {groupedEvents[date].map((event, eventIdx) => {
              const config = EVENT_ICON[event.event_type] || { icon: FileText, color: 'text-text-faint' }
              const Icon = config.icon
              const isLast = idx === dates.length - 1 && eventIdx === groupedEvents[date].length - 1
              
              return (
                <div key={event.id} className="relative pl-8">
                  {/* Timeline line */}
                  {!isLast && (
                    <div className="absolute left-[11px] top-7 bottom-[-24px] w-px bg-border-soft" />
                  )}
                  
                  {/* Icon Node */}
                  <div className="absolute left-0 top-0 w-[24px] h-[24px] rounded-full bg-surface border border-border-soft flex items-center justify-center z-10">
                    <Icon size={12} className={config.color} />
                  </div>
                  
                  {/* Event Content */}
                  <div className="bg-white/[0.02] border border-border-soft/50 rounded-xl p-4 transition-colors hover:bg-white/[0.04]">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-2">
                      <h4 className="font-semibold text-[14px] text-text">{event.title}</h4>
                      <span className="font-mono text-[12px] text-text-faint whitespace-nowrap">
                        {new Date(event.occurred_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-[13px] text-text-dim leading-relaxed mb-3">
                        {event.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-[12px] text-text-faint">
                      <User size={12} className="opacity-50" />
                      {event.actor}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}