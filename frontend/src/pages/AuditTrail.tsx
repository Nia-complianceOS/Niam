import { AuditEventList } from '@/components/audit/AuditEventList'
import { LoadingState, ErrorState, EmptyState, PageHeader } from '@/components/shared/PageStates'
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
        <EmptyState
          title="No audit events yet"
          message="Actions like commits, policy updates, and PR merges will appear here as they happen."
        />
      ) : (
        <AuditEventList events={data.events} />
      )}
    </div>
  )
}