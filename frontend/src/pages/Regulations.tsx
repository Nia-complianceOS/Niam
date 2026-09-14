import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, EmptyState, PageHeader } from '@/components/shared/PageStates'
import { TableSkeleton } from '@/components/skeletons/TableSkeleton'
import { useRegulations } from '@/hooks/useRegulations'
import type { RegulationCoverage } from '@/types/api'
import { useSEO } from '@/hooks/useSEO'
import { motion } from 'framer-motion'
import { CalendarClock, ShieldCheck } from 'lucide-react'

export default function Regulations() {
  useSEO({
    title: 'Regulations',
    description: 'Compliance status and upcoming commencement dates'
  })

  const { data, loading, error } = useRegulations()
  const regulations = data?.regulations ?? []

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
          <PageHeader
            eyebrow="Readiness"
            title="Regulations"
            subtitle="Coverage against global privacy frameworks, clause by clause."
          />
        </div>
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
          <PageHeader
            eyebrow="Readiness"
            title="Regulations"
            subtitle="Coverage against global privacy frameworks, clause by clause."
          />
        </div>
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
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <PageHeader
          eyebrow="Readiness"
          title="Regulations"
          subtitle="Coverage against global privacy frameworks, clause by clause."
        />
      </div>

      {regulations.length === 0 ? (
        <EmptyState
          title="No regulations loaded"
          message="Run the DPDP clause loader to populate the Act, then scan a repository to map data types against it."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {regulations.map((reg) => (
            <RegulationCard key={reg.code} regulation={reg} />
          ))}
        </div>
      )}
    </motion.div>
  )
}

function RegulationCard({ regulation }: { regulation: RegulationCoverage }) {
  const isDPDP = regulation.code === 'DPDP'
  
  // Parse score_label to get a percentage for the ring chart
  let percent = 0
  if (regulation.score_label) {
    if (regulation.score_label.includes('%')) {
      percent = parseInt(regulation.score_label.replace('%', ''), 10)
    } else if (regulation.score_label.includes('/')) {
      const [num, den] = regulation.score_label.split('/').map(s => parseInt(s, 10))
      if (den > 0) percent = Math.round((num / den) * 100)
    }
  }

  const radius = 24
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percent / 100) * circumference
  const ringColor = !regulation.enabled ? 'stroke-border-soft' : percent >= 80 ? 'stroke-accent-green' : percent >= 50 ? 'stroke-accent-amber' : 'stroke-accent-red'

  const REG_NAMES: Record<string, string> = {
    'DPDP': 'Digital Personal Data Protection Act 2023',
    'GDPR': 'General Data Protection Regulation',
    'SOC2': 'SOC 2 Type II',
    'HIPAA': 'Health Insurance Portability and Accountability Act'
  }

  return (
    <Card className={`relative overflow-hidden p-5 flex flex-col gap-4 ${isDPDP ? 'border-accent-blue/30 bg-accent-blue/[0.02] shadow-[0_0_20px_rgba(91,140,255,0.05)]' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-[18px] text-text">{regulation.code}</h3>
            <Badge tone={regulation.enabled ? 'good' : 'muted'}>
              {regulation.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            {isDPDP && <Badge tone="info">Primary</Badge>}
          </div>
          <div className="text-[13px] text-text-dim">{REG_NAMES[regulation.code] || regulation.code}</div>
        </div>
        
        {/* Ring Chart */}
        {regulation.enabled && regulation.score_label && (
          <div className="flex items-center justify-center relative w-[56px] h-[56px] flex-shrink-0">
            <svg className="w-full h-full -rotate-90 transform">
              <circle cx="28" cy="28" r="24" className="stroke-black/30 fill-none" strokeWidth="4" />
              <circle 
                cx="28" cy="28" r="24" 
                className={`fill-none transition-all duration-1000 ease-out ${ringColor}`} 
                strokeWidth="4" 
                strokeDasharray={circumference} 
                strokeDashoffset={strokeDashoffset} 
                strokeLinecap="round" 
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-[12px] font-semibold">{regulation.score_label}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats/Lists */}
      <div className="grid grid-cols-2 gap-4 mt-2">
        <div>
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wider mb-1.5">Mapped Controls</div>
          <div className="text-[13px] text-text-dim">
            {regulation.mapped_controls.length} {regulation.mapped_controls.length === 1 ? 'control' : 'controls'} connected
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wider mb-1.5">Affected Systems</div>
          <div className="text-[13px] text-text-dim">
            {regulation.affected_systems.length} {regulation.affected_systems.length === 1 ? 'system' : 'systems'} in scope
          </div>
        </div>
      </div>

      {/* Countdown footer */}
      {regulation.next_commencement_date && (
        <div className="mt-2 pt-3 border-t border-border-soft flex items-center justify-between">
          <div className="flex items-center gap-2 text-accent-amber text-[13px]">
            <CalendarClock size={16} />
            <span className="font-medium">Commencement</span>
          </div>
          <Countdown regulation={regulation} />
        </div>
      )}
      {!regulation.next_commencement_date && regulation.enabled && (
        <div className="mt-2 pt-3 border-t border-border-soft flex items-center gap-2 text-accent-green text-[13px]">
          <ShieldCheck size={16} />
          <span className="font-medium">In force</span>
        </div>
      )}
    </Card>
  )
}

function Countdown({ regulation }: { regulation: RegulationCoverage }) {
  if (!regulation.next_commencement_date) return null

  const date = new Date(regulation.next_commencement_date)
  const label = Number.isNaN(date.getTime())
    ? regulation.next_commencement_date
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="text-right">
      <div className="text-[13px] font-medium text-text">{label}</div>
      {regulation.next_commencement_days !== null && (
        <div className="text-[11px] text-text-dim">
          {regulation.next_commencement_days} days away
        </div>
      )}
    </div>
  )
}
