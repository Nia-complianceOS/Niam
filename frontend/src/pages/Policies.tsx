import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, GetStartedState, PageHeader } from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { usePolicies } from '@/hooks/usePolicies'
import type { Policy } from '@/types/api'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'
import { FileText } from 'lucide-react'

export default function Policies() {
  useSEO({
    title: 'Living Policies',
    description: 'Review living statutory privacy disclosures and code alignment.',
  })

  const { data, loading, error } = usePolicies()

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Statutory Schedules"
          title="Living Policies & Notices"
          subtitle="Legal disclosures and privacy schedules audited continuously against actual codebase behavior."
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Statutory Schedules"
          title="Living Policies & Notices"
          subtitle="Legal disclosures and privacy schedules audited continuously against actual codebase behavior."
        />
        <TableSkeleton rows={4} />
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
        eyebrow="Statutory Schedules"
        title="Living Policies & Notices"
        subtitle="Legal disclosures and privacy schedules audited continuously against actual codebase behavior."
      />
      
      {!data || data.policies.length === 0 ? (
        <GetStartedState
          title="No Policy Documents Registered"
          message="Connect a source repository to index repository privacy notices and data protection schedules. Niam correlates document commitments with AST data flows."
        />
      ) : (
        <Card className="overflow-hidden border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-sunken border-b border-border text-[11px] font-mono text-text-muted uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">Statutory Schedule</th>
                  <th className="px-5 py-3 font-medium">Policy Scope & Commitments</th>
                  <th className="px-5 py-3 font-medium">AST Alignment</th>
                  <th className="px-5 py-3 font-medium text-right">Audit Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-sans text-xs">
                {data.policies.map((policy: Policy) => (
                  <tr key={policy.id} className="hover:bg-surface-raised transition-colors group">
                    <td className="px-5 py-4 align-top w-[25%]">
                      <div className="font-medium text-text-primary flex items-start gap-2.5">
                        <FileText size={15} className="text-accent-clause mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="leading-snug">{policy.name}</span>
                          <div className="font-mono text-[10px] text-text-muted mt-0.5">
                            ID: {policy.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top w-[40%]">
                      <div className="text-text-secondary leading-relaxed font-sans">
                        {policy.description}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top w-[20%]">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-text-muted">Code Alignment</span>
                          <span className="text-text-primary font-semibold">{policy.coverage_percent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-sunken rounded border border-border-subtle overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-700 ease-out ${
                              policy.coverage_percent >= 80 ? 'bg-status-compliant' : policy.coverage_percent >= 50 ? 'bg-warning' : 'bg-danger'
                            }`}
                            style={{ width: `${policy.coverage_percent}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-right w-[15%]">
                      <Badge 
                        tone={policy.status === 'compliant' ? 'good' : policy.status === 'gap' ? 'gap' : policy.status === 'warning' ? 'warn' : 'muted'}
                      >
                        {policy.status_label || policy.status.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  )
}