import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { GapList } from '@/components/gaps/GapList'
import { GapDetail } from '@/components/gaps/GapDetail'
import { PRReviewModal } from '@/components/dashboard/PRReviewModal'
import {
  ErrorState,
  EmptyState,
  GetStartedState,
  PageHeader,
} from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { useGaps } from '@/hooks/useGaps'
import { useGapFilters } from '@/hooks/useGapFilters'
import { useSEO } from '@/hooks/useSEO'

export default function Gaps() {
  useSEO({
    title: 'Compliance Gaps',
    description: 'Detected compliance gaps in your scanned repositories',
  })

  const {
    gaps,
    selected,
    selectedId,
    select,
    loading,
    error,
    isEmptyAccount,
    scoreExplanation,
    fixLoading,
    prLoading,
    actionError,
    openedPR,
    dismissPR,
    runGenerateFix,
    runOpenPR,
  } = useGaps()

  const {
    status,
    setStatus,
    severity,
    setSeverity,
    query,
    setQuery,
    visibleGaps,
  } = useGapFilters(gaps)

  // Mobile layout state
  const [isMobileDetailView, setIsMobileDetailView] = useState(false)

  const handleSelect = (id: string) => {
    select(id)
    setIsMobileDetailView(true)
  }

  const handleBack = () => {
    setIsMobileDetailView(false)
  }

  // Deep link from the dashboard's "needs attention" list, so clicking a
  // finding there opens that exact finding here.
  const [params] = useSearchParams()
  const requested = params.get('select')
  useEffect(() => {
    if (requested && !selectedId && gaps.some((g) => g.id === requested)) {
      select(requested)
      // Automatically show detail view on mobile if deep-linked
      if (window.innerWidth < 1024) {
        setIsMobileDetailView(true)
      }
    }
  }, [requested, selectedId, gaps, select])

  // Sync mobile view state with selection
  useEffect(() => {
    if (selectedId && window.innerWidth < 1024) {
      setIsMobileDetailView(true)
    }
  }, [selectedId])

  if (error) {
    return (
      <div className="max-w-[1400px] h-full flex flex-col">
        <PageHeader
          eyebrow="Findings"
          title="Compliance Gaps"
          subtitle="Everything detected between your code, the DPDP Act, and your published policies — most urgent first."
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1400px] h-full flex flex-col">
        <PageHeader
          eyebrow="Findings"
          title="Compliance Gaps"
          subtitle="Everything detected between your code, the DPDP Act, and your published policies — most urgent first."
        />
        <TableSkeleton rows={5} />
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] h-full flex flex-col min-h-0">
      <div className="flex-shrink-0">
        <PageHeader
          eyebrow="Findings"
          title="Compliance Gaps"
          subtitle="Everything detected between your code, the DPDP Act, and your published policies — most urgent first."
        />
      </div>

      {isEmptyAccount ? (
        <GetStartedState
          title="No findings yet"
          message="Connect GitHub and scan a repository to get started. Anything that needs your attention — data collected without a legal basis, sharing your policy doesn't mention — will be listed here."
          detail={scoreExplanation}
        />
      ) : gaps.length === 0 ? (
        <EmptyState
          title="Nothing needs attention"
          message="Your most recent scan found nothing outstanding. New findings appear here after each scan."
        />
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* List Panel (Left) */}
          <div className={`w-full lg:w-[45%] h-full pr-0 lg:pr-4 flex-shrink-0 flex flex-col ${isMobileDetailView ? 'hidden lg:flex' : 'flex'}`}>
            <Card className="p-4 flex-1 min-h-0 flex flex-col bg-surface/50 backdrop-blur-sm border-border-soft/60">
              <GapList
                gaps={visibleGaps}
                totalCount={gaps.length}
                selectedId={selectedId}
                onSelect={handleSelect}
                query={query}
                onQueryChange={setQuery}
                status={status}
                onStatusChange={setStatus}
                severity={severity}
                onSeverityChange={setSeverity}
              />
            </Card>
          </div>

          {/* Detail Panel (Right) */}
          <div className={`w-full lg:w-[55%] h-full pl-0 lg:pl-0 flex-shrink-0 flex flex-col ${!isMobileDetailView ? 'hidden lg:flex' : 'flex'}`}>
            <GapDetail
              gap={selected}
              fixLoading={fixLoading}
              prLoading={prLoading}
              actionError={actionError}
              onGenerateFix={runGenerateFix}
              onOpenPR={runOpenPR}
              onBack={handleBack}
              isMobile={isMobileDetailView}
            />
          </div>
        </div>
      )}

      {openedPR && <PRReviewModal pr={openedPR} onClose={dismissPR} />}
    </div>
  )
}
