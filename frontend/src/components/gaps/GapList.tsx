import { Search } from 'lucide-react'
import type { Gap } from '@/types/api'
import {
  GAP_STATUS_LABELS,
  gapHeadline,
  kindCopy,
  severityClasses,
  SEVERITY_LABELS,
} from '@/lib/gapLanguage'

interface Props {
  gaps: Gap[]
  selectedId: string | null
  onSelect: (id: string) => void
  query?: string
  onQueryChange?: (q: string) => void
  /** Rows before the list starts scrolling. */
  visibleRows?: number
  totalCount?: number
}

/**
 * Every gap, most urgent first, in a fixed-height scrolling list.
 *
 * The dashboard previously exposed exactly one gap and no way to choose
 * it. A list is the whole difference between "the tool decided what to fix"
 * and "you decided" -- which for a compliance product is the difference
 * between a demo and something a legal team would use.
 */
export function GapList({
  gaps,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  visibleRows = 10,
  totalCount,
}: Props) {
  // ~10 rows then scroll, so the panel never pushes the rest of the page
  // off screen no matter how many findings there are.
  const maxHeight = visibleRows * 74

  return (
    <div className="flex flex-col min-h-0">
      {onQueryChange && (
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <input
            value={query ?? ''}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by data type, vendor, severity or file…"
            className="w-full bg-black/20 border border-border-soft rounded-[10px] pl-9 pr-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/50 transition-all"
          />
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-text-faint mb-2 px-0.5">
        <span>
          {gaps.length}
          {typeof totalCount === 'number' && totalCount !== gaps.length
            ? ` of ${totalCount}`
            : ''}{' '}
          finding{gaps.length === 1 ? '' : 's'}
        </span>
        <span>Most urgent first</span>
      </div>

      <div
        className="overflow-y-auto pr-1 flex flex-col gap-1.5"
        style={{ maxHeight }}
      >
        {gaps.length === 0 ? (
          <div className="text-[13px] text-text-faint px-2.5 py-6 text-center">
            Nothing matches that search.
          </div>
        ) : (
          gaps.map((gap) => {
            const isSelected = gap.id === selectedId
            const copy = kindCopy(gap.kind)
            const done = gap.status === 'resolved'
            return (
              <button
                key={gap.id}
                onClick={() => onSelect(gap.id)}
                className={`w-full text-left px-3 py-2.5 rounded-[10px] border transition-colors ${
                  isSelected
                    ? 'bg-accent-blue/[0.09] border-accent-blue/30'
                    : 'border-transparent hover:bg-white/[0.035] hover:border-border-soft'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-[2px] rounded border uppercase tracking-wide flex-shrink-0 ${severityClasses(
                      gap.severity
                    )}`}
                  >
                    {SEVERITY_LABELS[gap.severity ?? ''] ?? '—'}
                  </span>
                  <span
                    className={`text-[13.5px] font-medium truncate ${
                      done ? 'line-through text-text-faint' : ''
                    }`}
                  >
                    {gapHeadline(gap)}
                  </span>
                  {gap.status && gap.status !== 'open' && (
                    <span className="ml-auto flex-shrink-0 text-[10.5px] text-text-faint whitespace-nowrap">
                      {GAP_STATUS_LABELS[gap.status] ?? gap.status}
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-text-dim mt-1 truncate">
                  {copy.label}
                  {gap.source_file ? ` · ${gap.source_file}` : ''}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
