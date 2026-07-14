import { AuditEventList } from '@/components/audit/AuditEventList'
import { LoadingState, ErrorState, PageHeader } from '@/components/shared/PageStates'
import { useAuditTrail } from '@/hooks/useAuditTrail'

export default function AuditTrail() {
  const { data, loading, error } = useAuditTrail()

  if (loading) return <LoadingState label="Loading audit trail…" />
  if (error || !data) return <ErrorState message={error} />

  return (
    <div className="max-w-[1280px]">
      <PageHeader
        eyebrow="Immutable Log"
        title="Audit Trail"
        subtitle="Every action, timestamped and traceable — built for the auditor, not just the engineer."
      />
      <AuditEventList events={data.events} />
    </div>
  )
}