import { Search, ChevronDown } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import type { Gap } from '@/types/api'
import type { FilterStatus, FilterSeverity } from '@/hooks/useGapFilters'
import {
  GAP_STATUS_LABELS,
  gapHeadline,
  kindCopy,
  SEVERITY_LABELS,
} from '@/lib/gapLanguage'

interface Props {
  gaps: Gap[]
  selectedId: string | null
  onSelect: (id: string) => void
  query?: string
  onQueryChange?: (q: string) => void
  status?: FilterStatus
  onStatusChange?: (s: FilterStatus) => void
  severity?: FilterSeverity
  onSeverityChange?: (s: FilterSeverity) => void
  totalCount?: number
  visibleRows?: number
}

function getRelativeTime(dateStr: string) {
  const date = new Date(dateStr)
  const diffTime = date.getTime() - Date.now()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    const diffHours = Math.round(diffTime / (1000 * 60 * 60))
    if (diffHours === 0) return 'Just now'
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(diffHours, 'hour')
  }
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(diffDays, 'day')
}

const severityBadges: Record<string, { bg: string; border: string; text: string; label: string }> = {
  high: {
    bg: 'bg-status-gap/10',
    border: 'border-status-gap/30',
    text: 'text-status-gap',
    label: 'High Severity'
  },
  medium: {
    bg: 'bg-status-warning/10',
    border: 'border-status-warning/30',
    text: 'text-status-warning',
    label: 'Medium'
  },
  low: {
    bg: 'bg-status-compliant/10',
    border: 'border-status-compliant/30',
    text: 'text-status-compliant',
    label: 'Low'
  },
}

export function GapList({
  gaps,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  status,
  onStatusChange,
  severity,
  onSeverityChange,
  totalCount,
  visibleRows,
}: Props) {
  const showFilters = Boolean(onStatusChange && onSeverityChange && onQueryChange)
  const maxHeight = visibleRows ? visibleRows * 74 : undefined

  return (
    <div className="flex flex-col min-h-0 h-full font-sans">
      {showFilters && (
        <div className="flex flex-col gap-2.5 mb-3">
          {/* Filters Row */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select 
                value={status} 
                onChange={(e) => onStatusChange!(e.target.value as FilterStatus)}
                className="appearance-none bg-surface border border-border rounded pl-2.5 pr-7 py-1 text-xs text-text-primary hover:border-text-tertiary transition-colors cursor-pointer focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="fix_generated">Fix Generated</option>
                <option value="pr_opened">PR Opened</option>
                <option value="resolved">Resolved</option>
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            </div>
            
            <div className="relative">
              <select 
                value={severity} 
                onChange={(e) => onSeverityChange!(e.target.value as FilterSeverity)}
                className="appearance-none bg-surface border border-border rounded pl-2.5 pr-7 py-1 text-xs text-text-primary hover:border-text-tertiary transition-colors cursor-pointer focus:outline-none"
              >
                <option value="all">All Severities</option>
                <option value="high">High Severity</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={query}
              onChange={(e) => onQueryChange!(e.target.value)}
              placeholder="Search findings by clause or keyword..."
              className="w-full bg-bg border border-border rounded pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors"
            />
          </div>
        </div>
      )}

      {showFilters && (
        <div className="flex items-center justify-between text-[11px] font-mono text-text-tertiary mb-2 px-0.5">
          <span>
            {gaps.length} {gaps.length === 1 ? 'FINDING' : 'FINDINGS'}
            {totalCount !== undefined && totalCount !== gaps.length ? ` // FILTERED FROM ${totalCount}` : ''}
          </span>
        </div>
      )}

      <div className="overflow-y-auto pr-0.5 flex-1 flex flex-col gap-1.5 relative" style={{ maxHeight }}>
        {gaps.length === 0 ? (
          <div className="text-xs text-text-tertiary px-3 py-8 text-center flex flex-col items-center justify-center h-full">
            {showFilters && <Search size={20} className="mb-2 text-text-tertiary opacity-40" />}
            <span>{showFilters ? 'No findings match the current filter parameters.' : 'Zero outstanding findings.'}</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {gaps.map((gap) => {
              const isSelected = gap.id === selectedId
              const copy = kindCopy(gap.kind)
              const done = gap.status === 'resolved'
              const severityKey = gap.severity || 'low'
              const badge = severityBadges[severityKey] || severityBadges.low

              return (
                <div
                  key={gap.id}
                  onClick={() => onSelect(gap.id)}
                  role="button"
                  tabIndex={0}
                  className={`w-full text-left p-2.5 rounded border transition-colors cursor-pointer outline-none relative group ${
                    isSelected
                      ? 'bg-surface-elevated border-text-tertiary shadow-xs'
                      : 'bg-surface border-border hover:bg-surface-elevated/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-medium border uppercase ${badge.bg} ${badge.border} ${badge.text}`}>
                        {SEVERITY_LABELS[gap.severity ?? ''] || severityKey}
                      </span>
                      <span
                        className={`text-xs font-medium truncate leading-tight ${
                          done ? 'line-through text-text-tertiary' : 'text-text-primary'
                        }`}
                        title={gapHeadline(gap)}
                      >
                        {gapHeadline(gap)}
                      </span>
                    </div>
                    <span className="flex-shrink-0 text-[10px] font-mono text-text-tertiary whitespace-nowrap">
                      {getRelativeTime(gap.detected_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-1.5 py-0.2 rounded bg-bg border border-border text-[10px] font-mono text-text-secondary">
                      {copy.label}
                    </span>
                    {gap.status && gap.status !== 'open' && (
                      <span className="px-1.5 py-0.2 rounded bg-bg-subtle border border-border text-[10px] font-mono text-text-tertiary">
                        {GAP_STATUS_LABELS[gap.status] ?? gap.status}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
