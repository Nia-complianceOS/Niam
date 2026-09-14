import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GapList } from '@/components/gaps/GapList'
import { GapDetail } from '@/components/gaps/GapDetail'
import { PRReviewModal } from '@/components/dashboard/PRReviewModal'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { useGaps } from '@/hooks/useGaps'
import { useGapFilters } from '@/hooks/useGapFilters'
import { useSEO } from '@/hooks/useSEO'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

export default function Gaps() {
  useSEO({
    title: 'Compliance Findings Queue — Niam Statutory Ledger',
    description: 'Prioritized DPDP Act 2023 compliance gaps detected across scanned repositories.',
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

  const [params] = useSearchParams()
  const requested = params.get('select')
  useEffect(() => {
    if (requested && !selectedId && gaps.some((g) => g.id === requested)) {
      select(requested)
      if (window.innerWidth < 1024) {
        setIsMobileDetailView(true)
      }
    }
  }, [requested, selectedId, gaps, select])

  useEffect(() => {
    if (selectedId && window.innerWidth < 1024) {
      setIsMobileDetailView(true)
    }
  }, [selectedId])

  if (error) {
    return (
      <div className="max-w-[1400px] h-full flex flex-col font-sans space-y-6">
        <div className="pb-4 border-b border-border">
          <div className="flex items-center gap-2 text-[11px] font-mono text-text-tertiary uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-status-gap" />
            <span>STATUTORY ARBITRATION QUEUE</span>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-text-primary">Compliance Gaps</h1>
        </div>
        <div className="p-5 rounded border border-status-gap/30 bg-status-gap/5 text-xs text-text-secondary">
          <div className="text-status-gap font-medium mb-1">Queue Connection Fault</div>
          <div>{error}</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1400px] h-full flex flex-col font-sans space-y-6">
        <div className="pb-4 border-b border-border">
          <div className="flex items-center gap-2 text-[11px] font-mono text-text-tertiary uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-status-warning" />
            <span>LOADING FINDINGS</span>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-text-primary">Compliance Gaps</h1>
        </div>
        <TableSkeleton rows={5} />
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] h-full flex flex-col min-h-0 font-sans space-y-5">
      {/* 1. SECTION HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border flex-shrink-0">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-text-tertiary uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-status-gap" />
            <span>STATUTORY ARBITRATION QUEUE</span>
            <span className="text-border">/</span>
            <span>SEVERITY SORTED</span>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-text-primary">Compliance Gaps</h1>
          <p className="text-text-secondary text-xs mt-0.5">
            Statutory divergence between codebase behavior, India DPDP Act 2023 requirements, and published policies.
          </p>
        </div>

        <div className="font-mono text-[11px] text-text-tertiary">
          {gaps.length} TOTAL RECORDED FINDINGS
        </div>
      </div>

      {isEmptyAccount ? (
        <div className="p-8 rounded border border-border bg-surface max-w-xl text-xs text-text-secondary space-y-3">
          <div className="font-mono text-[10px] text-text-tertiary uppercase tracking-wider">
            Queue Unpopulated
          </div>
          <h2 className="font-serif text-xl font-medium text-text-primary">
            No Findings Recorded Yet
          </h2>
          <p className="leading-relaxed">
            {scoreExplanation || 'Connect GitHub and scan a repository to populate this queue with personal data flow discoveries and statutory obligations.'}
          </p>
          <div className="pt-2">
            <Link 
              to="/repositories" 
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-text-primary text-bg hover:opacity-90 transition-opacity"
            >
              <span>Scan Repositories</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      ) : gaps.length === 0 ? (
        <div className="p-8 rounded border border-border bg-surface max-w-xl text-xs text-text-secondary space-y-2">
          <div className="flex items-center gap-2 text-status-compliant font-medium">
            <CheckCircle2 size={16} />
            <span>All Discovered Flows Governed</span>
          </div>
          <p className="leading-relaxed">
            Your most recent scan detected zero unresolved statutory compliance gaps against India&apos;s DPDP Act 2023.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden gap-4">
          {/* List Panel (Left) */}
          <div className={`w-full lg:w-[45%] h-full flex-shrink-0 flex flex-col ${isMobileDetailView ? 'hidden lg:flex' : 'flex'}`}>
            <div className="p-4 flex-1 min-h-0 flex flex-col bg-surface rounded border border-border">
              <GapList
                gaps={visibleGaps}
                totalCount={gaps.length}
                selectedId={selectedId}
                onSelect={handleSelect}
                status={status}
                onStatusChange={setStatus}
                severity={severity}
                onSeverityChange={setSeverity}
                query={query}
                onQueryChange={setQuery}
              />
            </div>
          </div>

          {/* Detail Panel (Right) */}
          <div className={`w-full lg:w-[55%] h-full flex-col flex-1 min-w-0 ${isMobileDetailView ? 'flex' : 'hidden lg:flex'}`}>
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

      {openedPR && (
        <PRReviewModal
          pr={openedPR}
          onClose={dismissPR}
        />
      )}
    </div>
  )
}
