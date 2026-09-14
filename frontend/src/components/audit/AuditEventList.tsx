import type { AuditEvent } from '@/types/api'
import { GitCommit, FileText, Tags, Cookie, Database, CheckCircle2, User, Clock } from 'lucide-react'

const EVENT_CONFIG: Record<string, { icon: any, color: string, label: string }> = {
  commit_detected: { icon: GitCommit, color: 'text-accent-clause', label: 'CODEBASE COMMIT' },
  policy_updated: { icon: FileText, color: 'text-accent-datatype', label: 'POLICY REVISION' },
  vendor_added: { icon: Tags, color: 'text-accent-vendor', label: 'PROCESSOR INDEXED' },
  consent_changed: { icon: Cookie, color: 'text-warning', label: 'CONSENT BARRIER' },
  retention_updated: { icon: Database, color: 'text-accent-system', label: 'RETENTION AMENDMENT' },
  pr_merged: { icon: CheckCircle2, color: 'text-status-compliant', label: 'REMEDIATION MERGED' },
}

export function AuditEventList({ events }: { events: AuditEvent[] }) {
  // Group by date
  const groupedEvents: Record<string, AuditEvent[]> = {}
  
  events.forEach((event) => {
    const d = new Date(event.occurred_at)
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
    <div className="w-full max-w-[840px] mt-6">
      {dates.map((date, idx) => (
        <div key={date} className="relative mb-8">
          <div className="sticky top-[72px] z-10 bg-surface/95 backdrop-blur py-2 px-3 mb-4 rounded border-y border-border-subtle flex items-center justify-between">
            <h3 className="font-mono text-xs font-semibold tracking-wider text-text-muted uppercase">{date}</h3>
            <span className="font-mono text-[11px] text-text-muted">
              {groupedEvents[date].length} {groupedEvents[date].length === 1 ? 'event recorded' : 'events recorded'}
            </span>
          </div>
          
          <div className="space-y-4 pl-4 sm:pl-6">
            {groupedEvents[date].map((event, eventIdx) => {
              const config = EVENT_CONFIG[event.event_type] || { 
                icon: FileText, 
                color: 'text-text-muted',
                label: event.event_type.replace(/_/g, ' ').toUpperCase()
              }
              const Icon = config.icon
              const isLast = idx === dates.length - 1 && eventIdx === groupedEvents[date].length - 1
              
              return (
                <div key={event.id} className="relative pl-7">
                  {/* Timeline connector line */}
                  {!isLast && (
                    <div className="absolute left-[11px] top-7 bottom-[-20px] w-px bg-border-subtle" />
                  )}
                  
                  {/* Ledger Pin Node */}
                  <div className="absolute left-0 top-1 w-6 h-6 rounded border border-border bg-surface-sunken flex items-center justify-center z-10">
                    <Icon size={13} className={config.color} />
                  </div>
                  
                  {/* Event Ledger Card */}
                  <div className="bg-surface border border-border rounded p-4.5 hover:border-border-strong hover:bg-surface-raised transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-text-muted bg-surface-sunken px-1.5 py-0.5 rounded border border-border-subtle uppercase">
                          {config.label}
                        </span>
                        <h4 className="font-sans font-medium text-xs text-text-primary">{event.title}</h4>
                      </div>
                      <div className="flex items-center gap-1 font-mono text-[11px] text-text-muted whitespace-nowrap">
                        <Clock size={11} className="text-text-faint" />
                        <span>
                          {new Date(event.occurred_at).toLocaleTimeString(undefined, { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    {event.description && (
                      <p className="font-sans text-xs text-text-secondary leading-relaxed mb-3">
                        {event.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-border-subtle font-mono text-[11px] text-text-muted">
                      <div className="flex items-center gap-1.5">
                        <User size={11} className="text-text-faint" />
                        <span>Actor: <span className="text-text-primary">{event.actor}</span></span>
                      </div>
                      <span className="text-[10px] text-text-faint">ID: {event.id.slice(0, 8)}</span>
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