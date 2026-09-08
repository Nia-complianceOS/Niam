import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { GapList } from '@/components/gaps/GapList'
import { GapDetail } from '@/components/gaps/GapDetail'
import { PRReviewModal } from '@/components/dashboard/PRReviewModal'
import {
  LoadingState,
  ErrorState,
  EmptyState,
  GetStartedState,
  PageHeader,
} from '@/components/shared/PageStates'
import { useGaps } from '@/hooks/useGaps'
import { SEVERITY_RANK } from '@/lib/gapLanguage'

/**
 * The findings queue.
 *
 * Everything the reconciler detected, most urgent first, searchable, and
 * selectable one at a time. Before this page existed the only route to a
 * remediation was the dashboard's single-gap panel, which could reach
 * exactly one finding out of forty.
 */
export default function Gaps() {
  const {
    gaps,
    visible,
    selected,
    selectedId,
    select,
    query,
    setQuery,
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

  // Deep link from the dashboard's "needs attention" list, so clicking a
  // finding there opens that exact finding here.
  const [params] = useSearchParams()
  const requested = params.get('select')
  useEffect(() => {
    if (requested && !selectedId && gaps.some((g) => g.id === requested)) {
      select(requested)
    }
  }, [requested, selectedId, gaps, select])

  if (loading) return <LoadingState label="Loading findings…" />
  if (error) return <ErrorState message={error} />

  const counts = gaps.reduce<Record<string, number>>((acc, g) => {
    const key = g.severity ?? 'unrated'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const outstanding = gaps.filter((g) => g.status !== 'resolved').length

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Findings"
        title="Compliance Gaps"
        subtitle="Everything detected between your code, the DPDP Act, and your published policies — most urgent first."
      />

      {/* Two different empty pages. An account that has never scanned
          anything needs the next action; an account that HAS scanned and
          has nothing outstanding needs to be told that, and telling it
          "connect GitHub" would be nonsense. */}
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
        <>
          <div className="flex flex-wrap gap-2.5 mb-4">
            {(['high', 'medium', 'low'] as const)
              .filter((s) => counts[s])
              .sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])
              .map((s) => (
                <Card key={s} className="px-4 py-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-text-faint">
                    {s} severity
                  </div>
                  <div className="font-display text-[20px] font-semibold">
                    {counts[s]}
                  </div>
                </Card>
              ))}
            <Card className="px-4 py-2.5">
              <div className="text-[11px] uppercase tracking-wide text-text-faint">
                Outstanding
              </div>
              <div className="font-display text-[20px] font-semibold">
                {outstanding}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-[1.1fr_1fr] gap-4 items-start">
            <Card className="p-4">
              <GapList
                gaps={visible}
                totalCount={gaps.length}
                selectedId={selectedId}
                onSelect={select}
                query={query}
                onQueryChange={setQuery}
                visibleRows={10}
              />
            </Card>

            <GapDetail
              gap={selected}
              fixLoading={fixLoading}
              prLoading={prLoading}
              actionError={actionError}
              onGenerateFix={runGenerateFix}
              onOpenPR={runOpenPR}
            />
          </div>
        </>
      )}

      {openedPR && <PRReviewModal pr={openedPR} onClose={dismissPR} />}
    </div>
  )
}
