import { PolicyCard } from '@/components/policies/PolicyCard'
import { LoadingState, ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { usePolicies } from '@/hooks/usePolicies'
import type { Policy } from '@/types/api'

export default function Policies() {
  const { data, loading, error } = usePolicies()

  if (loading) return <LoadingState label="Loading policies…" />
  if (error) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Living Documents"
        title="Policies"
        subtitle="Legal documents that update automatically as your product changes."
      />
      {!data || data.policies.length === 0 ? (
        <GetStartedState
          title="No policy documents yet"
          message="Connect GitHub and scan a repository to get started. Niam reads the privacy policy and terms kept alongside your code, then keeps checking them against what the code actually does."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3.5">
          {data.policies.map((policy: Policy) => (
            <PolicyCard key={policy.id} policy={policy} />
          ))}
        </div>
      )}
    </div>
  )
}