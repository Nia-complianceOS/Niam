import { AuditEventList } from '@/components/audit/AuditEventList'
import { LoadingState, ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { useAuditTrail } from '@/hooks/useAuditTrail'

export default function AuditTrail() {
  const { data, loading, error } = useAuditTrail()

  if (loading) return <LoadingState label="Loading audit trail…" />
  if (error) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Immutable Log"
        title="Audit Trail"
        subtitle="Every action, timestamped and traceable — built for the auditor, not just the engineer."
      />
      {!data || data.events.length === 0 ? (
        <GetStartedState
          title="Nothing recorded yet"
          message="Connect GitHub and scan a repository to get started. From then on every scan, every finding and every policy amendment is logged here with a timestamp, ready for an auditor."
        />
      ) : (
        <AuditEventList events={data.events} />
      )}
    </div>
  )
}