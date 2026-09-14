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
    title: 'Policies',
    description: 'Review policy documents and coverage.',
  })

  const { data, loading, error } = usePolicies()

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Living Documents"
          title="Policies"
          subtitle="Legal documents that update automatically as your product changes."
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Living Documents"
          title="Policies"
          subtitle="Legal documents that update automatically as your product changes."
        />
        <TableSkeleton rows={4} />
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
        <Card className="min-w-[800px] overflow-hidden border-border-soft">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/20 border-b border-border-soft text-[12px] font-semibold text-text-faint uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Policy Name</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Coverage</th>
                <th className="px-4 py-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft/50">
              {data.policies.map((policy: Policy) => (
                <tr key={policy.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 align-top w-[25%]">
                    <div className="font-semibold text-[14px] text-text flex items-center gap-2">
                      <FileText size={16} className="text-text-faint flex-shrink-0" />
                      {policy.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top w-[35%]">
                    <div className="text-[13px] text-text-dim leading-relaxed">
                      {policy.description}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top w-[25%]">
                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-text-faint">Coverage Match</span>
                        <span className="font-medium text-text">{policy.coverage_percent}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${
                            policy.coverage_percent >= 80 ? 'bg-accent-green' : policy.coverage_percent >= 50 ? 'bg-accent-amber' : 'bg-accent-red'
                          }`}
                          style={{ width: `${policy.coverage_percent}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-right w-[15%]">
                    <div className="mt-1">
                      <Badge 
                        tone={policy.status === 'compliant' ? 'good' : policy.status === 'gap' ? 'gap' : policy.status === 'warning' ? 'warn' : 'muted'}
                      >
                        {policy.status_label}
                      </Badge>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </motion.div>
  )
}