import { RegulationsAccordion } from '@/components/regulations/RegulationsAccordion'
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/shared/PageStates'
import { useRegulations } from '@/hooks/useRegulations'
import type { RegulationCoverage } from '@/types/api'

/**
 * DPDP readiness, per clause.
 *
 * This file previously contained a byte-for-byte copy of PullRequests.tsx --
 * same imports, same hook, same JSX, even `export default function
 * PullRequests`. So the Regulations route rendered the pull request list,
 * and RegulationsAccordion / useRegulations were never mounted by anything.
 * Every backend fix aimed at this page (the real clause counts, the
 * Tranche-2 countdown, the honest Mapped Controls / Affected Systems
 * columns) was invisible because nothing rendered it.
 */
export default function Regulations() {
  const { data, loading, error } = useRegulations()

  if (loading) return <LoadingState label="Loading regulations…" />
  if (error) return <ErrorState message={error} />

  const regulations = data?.regulations ?? []
  const dpdp = regulations.find((r) => r.code === 'DPDP')

  return (
    <div className="max-w-[1280px]">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <PageHeader
          eyebrow="Readiness"
          title="Regulations"
          subtitle="Coverage against the DPDP Act 2023, clause by clause — and how long you have."
        />
        {dpdp && <Countdown regulation={dpdp} />}
      </div>

      {regulations.length === 0 ? (
        <EmptyState
          title="No regulations loaded"
          message="Run the DPDP clause loader to populate the Act, then scan a repository to map data types against it."
        />
      ) : (
        <RegulationsAccordion regulations={regulations} />
      )}
    </div>
  )
}

/**
 * The commencement countdown. Sourced from legal/commencement.py via
 * gap_service.list_regulations() -- it is the next tranche that has not
 * happened yet, not a hardcoded date. Most of the Act's substantive
 * obligations are not in force today, which is why this page is framed as
 * readiness rather than present-tense compliance.
 */
function Countdown({ regulation }: { regulation: RegulationCoverage }) {
  if (!regulation.next_commencement_date) return null

  const date = new Date(regulation.next_commencement_date)
  const label = Number.isNaN(date.getTime())
    ? regulation.next_commencement_date
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="text-right">
      <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide">
        Next commencement
      </div>
      <div className="font-display text-[15px] font-semibold text-text">{label}</div>
      {regulation.next_commencement_days !== null && (
        <div className="text-xs text-text-dim">
          {regulation.next_commencement_days} days away
        </div>
      )}
    </div>
  )
}
