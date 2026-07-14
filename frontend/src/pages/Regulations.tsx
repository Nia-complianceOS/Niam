import { RegulationsAccordion } from '@/components/regulations/RegulationsAccordion'
import { LoadingState, ErrorState, PageHeader } from '@/components/shared/PageStates'
import { useRegulations } from '@/hooks/useRegulations'

export default function Regulations() {
  const { data, loading, error } = useRegulations()

  if (loading) return <LoadingState label="Loading regulations…" />
  if (error || !data) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Frameworks"
        title="Regulations"
        subtitle="Coverage across every framework your product is required to meet."
      />
      <RegulationsAccordion regulations={data.regulations} />
    </div>
  )
}