import { useState, useMemo } from 'react'
import type { Gap, GapStatus, GapSeverity } from '@/types/api'
import { gapMatches } from '@/lib/gapLanguage'

export type FilterStatus = GapStatus | 'all'
export type FilterSeverity = GapSeverity | 'all'

export function useGapFilters(gaps: Gap[]) {
  const [status, setStatus] = useState<FilterStatus>('all')
  const [severity, setSeverity] = useState<FilterSeverity>('all')
  const [query, setQuery] = useState('')

  const visibleGaps = useMemo(() => {
    return gaps.filter((gap) => {
      // 1. Filter by status
      if (status !== 'all' && gap.status !== status) {
        return false
      }
      
      // 2. Filter by severity
      if (severity !== 'all' && gap.severity !== severity) {
        return false
      }
      
      // 3. Filter by text search (query)
      if (query && !gapMatches(gap, query)) {
        return false
      }

      return true
    })
  }, [gaps, status, severity, query])

  return {
    status,
    setStatus,
    severity,
    setSeverity,
    query,
    setQuery,
    visibleGaps,
  }
}
