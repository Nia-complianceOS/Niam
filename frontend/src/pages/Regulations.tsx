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
    title: 'Statutory Frameworks',
    description: 'Statutory compliance status and DPDP Act 2023 commencement timelines.'
  })

  const { data, loading, error } = useRegulations()
  const regulations = data?.regulations ?? []

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Statutory Readiness"
          title="Regulations & Frameworks"
          subtitle="Coverage against applicable data protection acts and statutory enforcement schedules."
        />
        <ErrorState message={error} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <PageHeader
          eyebrow="Statutory Readiness"
          title="Regulations & Frameworks"
          subtitle="Coverage against applicable data protection acts and statutory enforcement schedules."
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
        eyebrow="Statutory Readiness"
        title="Regulations & Frameworks"
        subtitle="Coverage against applicable data protection acts and statutory enforcement schedules."
      />

      {regulations.length === 0 ? (
        <EmptyState
          title="No Regulatory Frameworks Loaded"
          message="Run the DPDP statutory clause loader to initialize the Act, then scan a repository to map discovered AST data flows against compliance controls."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
  
  let percent = 0
  if (regulation.score_label) {
    if (regulation.score_label.includes('%')) {
      percent = parseInt(regulation.score_label.replace('%', ''), 10)
    } else if (regulation.score_label.includes('/')) {
      const [num, den] = regulation.score_label.split('/').map(s => parseInt(s, 10))
      if (den > 0) percent = Math.round((num / den) * 100)
    }
  }

  const radius = 22
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percent / 100) * circumference
  const ringColor = !regulation.enabled 
    ? 'stroke-border' 
    : percent >= 80 
      ? 'stroke-status-compliant' 
      : percent >= 50 
        ? 'stroke-warning' 
        : 'stroke-danger'

  const REG_NAMES: Record<string, string> = {
    'DPDP': 'Digital Personal Data Protection Act, 2023 (India)',
    'GDPR': 'General Data Protection Regulation (EU 2016/679)',
    'SOC2': 'AICPA SOC 2 Type II Privacy & Security Controls',
    'HIPAA': 'Health Insurance Portability and Accountability Act'
  }

  return (
    <Card 
      className={`relative overflow-hidden p-6 flex flex-col justify-between border-border bg-surface hover:border-border-strong transition-all ${
        isDPDP ? 'border-accent-clause/40 ring-1 ring-accent-clause/20' : ''
      }`}
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="font-mono font-semibold text-base text-text-primary tracking-wide">{regulation.code}</h3>
              <Badge tone={regulation.enabled ? 'good' : 'muted'}>
                {regulation.enabled ? 'ACTIVE INVENTORY' : 'UNMONITORED'}
              </Badge>
              {isDPDP && (
                <span className="font-mono text-[10px] text-accent-clause bg-accent-clause/10 border border-accent-clause/30 px-1.5 py-0.5 rounded font-medium">
                  PRIMARY ACT
                </span>
              )}
            </div>
            <div className="text-xs text-text-secondary font-sans leading-relaxed">
              {REG_NAMES[regulation.code] || regulation.code}
            </div>
          </div>
          
          {/* Ring Chart */}
          {regulation.enabled && regulation.score_label && (
            <div className="flex items-center justify-center relative w-14 h-14 flex-shrink-0 bg-surface-sunken rounded-full border border-border-subtle p-1">
              <svg className="w-full h-full -rotate-90 transform">
                <circle cx="24" cy="24" r="20" className="stroke-border-subtle fill-none" strokeWidth="3" />
                <circle 
                  cx="24" cy="24" r="20" 
                  className={`fill-none transition-all duration-700 ease-out ${ringColor}`} 
                  strokeWidth="3" 
                  strokeDasharray={circumference} 
                  strokeDashoffset={strokeDashoffset} 
                  strokeLinecap="round" 
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-mono font-semibold text-text-primary">{regulation.score_label}</span>
              </div>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 py-3 border-y border-border-subtle my-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-0.5">Statutory Controls</div>
            <div className="text-xs font-mono text-text-primary">
              {regulation.mapped_controls.length} {regulation.mapped_controls.length === 1 ? 'control' : 'controls'} indexed
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-0.5">In-Scope Systems</div>
            <div className="text-xs font-mono text-text-primary">
              {regulation.affected_systems.length} {regulation.affected_systems.length === 1 ? 'system' : 'systems'} bound
            </div>
          </div>
        </div>
      </div>

      {/* Enforcement Schedule footer */}
      {regulation.next_commencement_date ? (
        <div className="pt-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-warning">
            <CalendarClock size={14} />
            <span className="font-medium">Enforcement Schedule</span>
          </div>
          <Countdown regulation={regulation} />
        </div>
      ) : regulation.enabled ? (
        <div className="pt-2 flex items-center gap-1.5 text-status-compliant text-xs font-medium">
          <ShieldCheck size={14} />
          <span>Statute Enacted & Enforceable</span>
        </div>
      ) : null}
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
      <div className="text-xs font-mono font-medium text-text-primary">{label}</div>
      {regulation.next_commencement_days !== null && (
        <div className="text-[11px] font-mono text-text-muted">
          {regulation.next_commencement_days} days remaining
        </div>
      )}
    </div>
  )
}
