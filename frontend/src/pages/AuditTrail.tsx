import { AuditEventList } from '@/components/audit/AuditEventList'
import { ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { useAuditTrail } from '@/hooks/useAuditTrail'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'

export default function AuditTrail() {
  useSEO({
    title: 'Audit Trail',
    description: 'Forensic immutable log of compliance events and regulatory amendments.',
  })

  const { data, loading, error } = useAuditTrail()

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Forensic Ledger"
          title="Audit Trail"
          subtitle="Immutable, timestamped record of AST scans, detected data flows, and remediation amendments."
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
          subtitle="Immutable, timestamped record of AST scans, detected data flows, and remediation amendments."
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
        subtitle="Immutable, timestamped record of AST scans, detected data flows, and remediation amendments."
      />
      {!data || data.events.length === 0 ? (
        <GetStartedState
          title="Audit Ledger Empty"
          message="Connect a source repository to initiate static compliance analysis. Every subsequent scan, AST finding, vendor indexing, and remediation diff is permanently recorded here."
        />
      ) : (
        <AuditEventList events={data.events} />
      )}
    </motion.div>
  )
}