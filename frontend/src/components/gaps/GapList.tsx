import { Search, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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

const severityDots: Record<string, string> = {
  high: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
  medium: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]',
  low: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]',
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
    <div className="flex flex-col min-h-0 h-full">
      {showFilters && (
        <div className="flex flex-col gap-3 mb-4">
          {/* Filters Row */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select 
                value={status} 
                onChange={(e) => onStatusChange!(e.target.value as FilterStatus)}
                className="appearance-none bg-surface border border-border-soft rounded-[8px] pl-3 pr-8 py-1.5 text-[12.5px] text-text hover:border-border transition-colors cursor-pointer focus:outline-none focus:border-accent-blue"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="fix_generated">Fix Generated</option>
                <option value="pr_opened">PR Opened</option>
                <option value="resolved">Resolved</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
            </div>
            
            <div className="relative">
              <select 
                value={severity} 
                onChange={(e) => onSeverityChange!(e.target.value as FilterSeverity)}
                className="appearance-none bg-surface border border-border-soft rounded-[8px] pl-3 pr-8 py-1.5 text-[12.5px] text-text hover:border-border transition-colors cursor-pointer focus:outline-none focus:border-accent-blue"
              >
                <option value="all">All Severities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
            />
            <input
              value={query}
              onChange={(e) => onQueryChange!(e.target.value)}
              placeholder="Search findings by title or keyword..."
              className="w-full bg-black/20 border border-border-soft rounded-[10px] pl-9 pr-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
            />
          </div>
        </div>
      )}

      {showFilters && (
        <div className="flex items-center justify-between text-[11px] font-semibold tracking-wide uppercase text-text-faint mb-3 px-1">
          <span>
            {gaps.length} {gaps.length === 1 ? 'Finding' : 'Findings'}
            {totalCount !== undefined && totalCount !== gaps.length ? ` (Filtered from ${totalCount})` : ''}
          </span>
        </div>
      )}

      <div className="overflow-y-auto pr-1 flex-1 flex flex-col gap-2 relative" style={{ maxHeight }}>
        {gaps.length === 0 ? (
          <div className="text-[13px] text-text-faint px-2.5 py-8 text-center flex flex-col items-center justify-center h-full">
            {showFilters && <span className="mb-1 text-lg">🔍</span>}
            <span>{showFilters ? 'No findings match these filters.' : 'No findings.'}</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {gaps.map((gap) => {
              const isSelected = gap.id === selectedId
              const copy = kindCopy(gap.kind)
              const done = gap.status === 'resolved'
              const severityKey = gap.severity || 'low'
              const dotClass = severityDots[severityKey] || severityDots.low

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  key={gap.id}
                  onClick={() => onSelect(gap.id)}
                  role="button"
                  tabIndex={0}
                  className={`w-full text-left p-3 rounded-[10px] border transition-all cursor-pointer outline-none relative group overflow-hidden ${
                    isSelected
                      ? 'bg-accent-blue/[0.08] border-accent-blue/40 shadow-sm'
                      : 'bg-surface border-border-soft hover:bg-white/[0.03] hover:border-border-soft/80'
                  }`}
                >
                  {isSelected && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute left-0 top-0 bottom-0 w-[4px] bg-accent-blue shadow-[0_0_10px_rgba(59,130,246,0.8)] rounded-l-[10px]" 
                    />
                  )}
                  
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} title={SEVERITY_LABELS[gap.severity ?? '']} />
                      <span
                        className={`text-[13.5px] font-semibold truncate leading-tight ${
                          done ? 'line-through text-text-faint' : 'text-text'
                        }`}
                        title={gapHeadline(gap)}
                      >
                        {gapHeadline(gap)}
                      </span>
                    </div>
                    <span className="flex-shrink-0 text-[10px] font-medium text-text-faint whitespace-nowrap bg-black/20 px-1.5 py-0.5 rounded">
                      {getRelativeTime(gap.detected_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <span className="px-2 py-[2px] rounded-full bg-accent-blue/10 border border-accent-blue/20 text-[10.5px] font-semibold text-accent-blue uppercase tracking-wide">
                      {copy.label}
                    </span>
                    {gap.status && gap.status !== 'open' && (
                      <span className="px-2 py-[2px] rounded-full bg-white/10 border border-border-soft text-[10.5px] font-medium text-text-dim">
                        {GAP_STATUS_LABELS[gap.status] ?? gap.status}
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
