import { AuditEventList } from '@/components/audit/AuditEventList'
import { ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { useAuditTrail } from '@/hooks/useAuditTrail'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'

export default function AuditTrail() {
  useSEO({
    title: 'Audit Trail',
    description: 'An immutable log of actions taken in the platform.',
  })

  const { data, loading, error } = useAuditTrail()

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Immutable Log"
          title="Audit Trail"
          subtitle="Every action, timestamped and traceable — built for the auditor, not just the engineer."
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Immutable Log"
          title="Audit Trail"
          subtitle="Every action, timestamped and traceable — built for the auditor, not just the engineer."
        />
        <TableSkeleton rows={6} />
      </div>
    )
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1280px]"
    >
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
    </motion.div>
  )
}