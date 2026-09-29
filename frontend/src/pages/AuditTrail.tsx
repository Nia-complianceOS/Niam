import { AuditEventList } from '@/components/audit/AuditEventList'
import { ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { useAuditTrail } from '@/hooks/useAuditTrail'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'

// Accurate about its limits: this is an activity log, not a tamper-proof
// record. Resetting the workspace (Settings) deletes it along with the
// findings.
const AUDIT_SUBTITLE =
  'Timestamped record of scans, GitHub connections and pull requests on this account. Resetting the workspace in Settings deletes this log along with the findings.'

export default function AuditTrail() {
  useSEO({
    title: 'Audit Trail',
    description: 'Timestamped log of scans, GitHub connections and pull requests on this account.',
  })

  const { data, loading, error } = useAuditTrail()

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Forensic Ledger"
          title="Audit Trail"
          subtitle={AUDIT_SUBTITLE}
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Forensic Ledger"
          title="Audit Trail"
          subtitle={AUDIT_SUBTITLE}
        />
        <TableSkeleton rows={6} />
      </div>
    )
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-[1280px]"
    >
      <PageHeader
        eyebrow="Forensic Ledger"
        title="Audit Trail"
        subtitle={AUDIT_SUBTITLE}
      />
      {!data || data.events.length === 0 ? (
        <GetStartedState
          title="Audit Ledger Empty"
          message="Connect a source repository and run a scan. Scans, GitHub connections and pull requests on this account are recorded here as they happen."
        />
      ) : (
        <AuditEventList events={data.events} />
      )}
    </motion.div>
  )
}