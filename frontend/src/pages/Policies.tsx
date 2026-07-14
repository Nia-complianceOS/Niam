import { PolicyCard } from '@/components/policies/PolicyCard'
import { LoadingState, ErrorState, PageHeader } from '@/components/shared/PageStates'
import { usePolicies } from '@/hooks/usePolicies'

export default function Policies() {
  const { data, loading, error } = usePolicies()

  if (loading) return <LoadingState label="Loading policies…" />
  if (error || !data) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Living Documents"
        title="Policies"
        subtitle="Legal documents that update automatically as your product changes."
      />
      <div className="grid grid-cols-2 gap-3.5">
        {data.policies.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} />
        ))}
      </div>
    </div>
  )
}