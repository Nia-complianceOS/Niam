import { Card } from '@/components/ui/Card'
import { GapList } from '@/components/gaps/GapList'
import { DashboardSkeleton } from '@/components/skeletons/DashboardSkeleton'
import { useDashboard } from '@/hooks/useDashboard'
import { useSEO } from '@/hooks/useSEO'
import { StructuredData } from '@/components/seo/StructuredData'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ShieldCheck, ShieldAlert, Scale, GitCommit } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

export default function Dashboard() {
  useSEO({ 
    title: 'Executive Dashboard — Niam Statutory Ledger', 
    description: 'Continuous DPDP Act 2023 compliance score, statutory risk heatmap, and prioritized findings.' 
  })

  const {
    summary,
    gaps,
    isEmptyAccount,
    scoreExplanation,
    score,
    loading,
    error,
    selectCommit,
  } = useDashboard()
  const navigate = useNavigate()
  const topGaps = gaps.filter((g) => g.status !== 'resolved').slice(0, 5)
  
  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Niam",
    "description": "Scans codebases for personal data handling and maps against India's DPDP Act 2023",
    "applicationCategory": "Compliance Software",
    "operatingSystem": "Web"
  }

  if (error) {
    return (
      <div className="max-w-[1280px] w-full font-sans">
        <StructuredData data={softwareSchema} />
        <div className="mb-6">
          <span className="font-mono text-[11px] text-text-tertiary uppercase tracking-wider block mb-1">
            System Fault
          </span>
          <h1 className="font-serif text-3xl font-medium text-text-primary tracking-tight">Ledger Unavailable</h1>
        </div>
        <Card className="p-6 rounded border border-status-gap/30 bg-status-gap/5">
          <div className="text-status-gap font-medium text-sm mb-1">Could not connect to the statutory API service</div>
          <div className="text-text-secondary text-xs leading-relaxed">{error}</div>
          <div className="text-text-tertiary font-mono text-[11px] mt-4 pt-3 border-t border-border">
            Verify network connectivity and ensure the Niam backend service is active.
          </div>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px] w-full font-sans">
        <StructuredData data={softwareSchema} />
        <div className="mb-6">
          <span className="font-mono text-[11px] text-text-tertiary uppercase tracking-wider block mb-1">
            Telemetry
          </span>
          <h1 className="font-serif text-3xl font-medium text-text-primary tracking-tight">Loading Ledger...</h1>
        </div>
        <DashboardSkeleton />
      </div>
    )
  }

  if (!summary || isEmptyAccount) {
    return (
      <div className="max-w-[1280px] w-full font-sans">
        <StructuredData data={softwareSchema} />
        <div className="mb-8">
          <span className="font-mono text-[11px] text-text-tertiary uppercase tracking-wider block mb-1">
            Initial Onboarding
          </span>
          <h1 className="font-serif text-3xl font-medium text-text-primary tracking-tight">Establish Statutory Ledger</h1>
          <p className="text-text-secondary text-xs mt-1">
            Connect a source repository to initiate automated DPDP Act 2023 compliance arbitration.
          </p>
        </div>

        <div className="max-w-2xl p-6 rounded border border-border bg-surface">
          <h2 className="font-serif text-xl font-medium text-text-primary mb-2">Repository Initialization Required</h2>
          <p className="text-xs text-text-secondary mb-6 leading-relaxed">
            {scoreExplanation || 'Connect your GitHub organization to discover personal data egress and generate your compliance knowledge graph.'}
          </p>
          
          <div className="space-y-4">
            <div className="flex gap-3.5 p-3.5 rounded border border-border bg-bg items-start">
              <div className="w-7 h-7 rounded border border-status-compliant/30 bg-status-compliant/10 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 size={15} className="text-status-compliant" />
              </div>
              <div>
                <h3 className="text-xs font-medium text-text-primary">1. Authentication Verified</h3>
                <p className="text-[11px] text-text-secondary mt-0.5">Your organization workspace is active and credentialed.</p>
              </div>
            </div>
            
            <div className="flex gap-3.5 p-3.5 rounded border border-border bg-bg items-start">
              <div className="w-7 h-7 rounded border border-border bg-surface flex items-center justify-center shrink-0 mt-0.5 font-mono text-xs text-text-primary font-medium">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-medium text-text-primary">2. Scan Repository AST</h3>
                <p className="text-[11px] text-text-secondary mt-0.5 mb-3">Authorize scoped access to scan data flows and parse third-party processors.</p>
                <Link 
                  to="/repositories" 
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-text-primary text-bg hover:opacity-90 transition-opacity"
                >
                  Configure Repositories
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
            
            <div className="flex gap-3.5 p-3.5 rounded border border-border/50 bg-bg/40 items-start opacity-60">
              <div className="w-7 h-7 rounded border border-border bg-surface flex items-center justify-center shrink-0 mt-0.5 font-mono text-xs text-text-tertiary">
                3
              </div>
              <div>
                <h3 className="text-xs font-medium text-text-tertiary">3. Review Statutory Findings & PRs</h3>
                <p className="text-[11px] text-text-tertiary mt-0.5">Automated policy amendments will populate once the initial scan concludes.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Derived severity metrics
  const severityData = [
    { name: 'High', value: gaps.filter(g => g.severity === 'high').length, fill: '#F43F5E' },
    { name: 'Medium', value: gaps.filter(g => g.severity === 'medium').length, fill: '#F59E0B' },
    { name: 'Low', value: gaps.filter(g => g.severity === 'low').length, fill: '#10B981' }
  ].filter(d => d.value > 0)

  const kinds = gaps.reduce((acc, gap) => {
    const kind = gap.kind || 'unknown'
    acc[kind] = (acc[kind] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const kindData = Object.entries(kinds).map(([name, value], i) => ({
    name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value,
    fill: ['#0284C7', '#7C3AED', '#10B981', '#F59E0B', '#F43F5E'][i % 5]
  }))

  const percentage = score ?? 0
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  // Unified activity feed sorted chronologically
  const unifiedActivity = [
    ...summary.timeline.map(t => ({ 
      id: t.title, 
      title: t.title, 
      meta: t.meta, 
      date: new Date().getTime(),
      type: 'timeline' as const,
      tag: t.tag,
      impact: undefined
    })),
    ...summary.recent_commits.map(c => ({
      id: c.commit.sha,
      title: c.commit.message,
      meta: `${c.commit.author} on ${c.commit.repo}`,
      date: new Date(c.commit.committed_at).getTime(),
      type: 'commit' as const,
      impact: c.has_compliance_impact,
      tag: undefined
    }))
  ].sort((a, b) => b.date - a.date).slice(0, 8)

  return (
    <div className="max-w-[1280px] w-full font-sans space-y-6">
      <StructuredData data={softwareSchema} />
      
      {/* 1. EXECUTIVE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-text-tertiary uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-status-compliant" />
            <span>DPDP ACT 2023 AUDIT LEDGER</span>
            <span className="text-border">/</span>
            <span>SYNCED {new Date(summary.synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-text-primary">Compliance Posture</h1>
          <p className="text-text-secondary text-xs mt-0.5">
            Continuous statutory risk governance across connected codebases.
          </p>
        </div>

        {summary.sample_panels && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-status-warning/30 bg-status-warning/10 text-status-warning text-[11px] font-mono">
            <span>DEMO MODE // SAMPLE TELEMETRY</span>
          </div>
        )}
      </div>

      {/* 2. STATUTORY SCORE & METRICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Readiness Meter */}
        <div className="col-span-1 md:col-span-3 xl:col-span-2 p-5 rounded border border-border bg-surface flex items-center gap-5 shadow-xs">
          <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
            <svg className="w-full h-full transform -rotate-90">
              <circle 
                cx="40" 
                cy="40" 
                r={radius} 
                fill="transparent" 
                stroke="currentColor" 
                strokeWidth="6" 
                className="text-border" 
              />
              <circle 
                cx="40" 
                cy="40" 
                r={radius} 
                fill="transparent" 
                stroke={percentage >= 75 ? 'var(--status-compliant)' : percentage >= 50 ? 'var(--status-warning)' : 'var(--status-gap)'}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={score === null ? circumference : strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-xl font-semibold text-text-primary">
                {score === null ? '—' : `${score}%`}
              </span>
            </div>
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm text-text-primary">Readiness Rating</h3>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded border border-border bg-bg text-text-tertiary">
                DPDP
              </span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {score === null 
                ? 'Score will compute after initial repository scan.' 
                : scoreExplanation || 'Overall readiness against statutory DPDP notice and purpose limitation rules.'}
            </p>
          </div>
        </div>

        {/* Real Backend Metric Cards */}
        {summary.stat_cards.slice(1).map((card, i) => {
          let to = '/gaps'
          let Icon = ShieldAlert
          let valueColor = 'text-text-primary'

          if (card.label.toLowerCase().includes('gap')) {
            to = '/gaps'
            Icon = ShieldAlert
            valueColor = card.value !== '0' ? 'text-status-gap' : 'text-status-compliant'
          } else if (card.label.toLowerCase().includes('system')) {
            to = '/graph'
            Icon = ShieldCheck
          } else if (card.label.toLowerCase().includes('vendor')) {
            to = '/vendors'
            Icon = Scale
          } else if (card.label.toLowerCase().includes('clause')) {
            to = '/regulations'
            Icon = CheckCircle2
            valueColor = 'text-status-compliant'
          }

          return (
            <Link 
              key={i} 
              to={to} 
              className="col-span-1 p-4 rounded border border-border bg-surface hover:bg-surface-elevated/70 transition-colors flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between text-text-tertiary mb-3">
                <span className="font-mono text-[10px] uppercase tracking-wide truncate">{card.label}</span>
                <Icon size={14} strokeWidth={1.75} className="group-hover:text-text-primary transition-colors flex-shrink-0" />
              </div>
              <div>
                <div className={`font-mono text-2xl font-semibold ${valueColor}`}>{card.value}</div>
                {card.sub_label && (
                  <div className="font-mono text-[10px] text-text-tertiary mt-1 truncate">
                    {card.sub_label}
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {/* 3. RISK HEATMAP & PRIORITY FINDINGS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Risk Overview Heatmap */}
        <div className="lg:col-span-2 p-5 rounded border border-border bg-surface space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <h2 className="font-medium text-sm text-text-primary">Statutory Risk Distribution</h2>
              <span className="font-mono text-[10px] text-text-tertiary px-1.5 py-0.2 rounded border border-border bg-bg">
                AST-MAPPED
              </span>
            </div>
            <Link to="/gaps" className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1 font-medium">
              View All Findings <ArrowRight size={12} />
            </Link>
          </div>
          
          {severityData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-text-tertiary font-mono text-xs">
              ZERO ACTIVE RISK VECTORS IDENTIFIED
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[200px]">
              <div className="w-full h-full flex flex-col">
                <span className="font-mono text-[10px] text-text-tertiary uppercase mb-2">By Statutory Severity</span>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={severityData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'monospace' }} 
                        width={60}
                      />
                      <Tooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        contentStyle={{ 
                          backgroundColor: 'var(--surface-elevated)', 
                          borderColor: 'var(--border)', 
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontFamily: 'monospace'
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 2, 2, 0]} barSize={14}>
                        {severityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="w-full h-full flex flex-col">
                <span className="font-mono text-[10px] text-text-tertiary uppercase mb-2">By Breach Classification</span>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={kindData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {kindData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--surface-elevated)', 
                          borderColor: 'var(--border)', 
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontFamily: 'monospace'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Priority Findings Queue */}
        <div className="lg:col-span-1 p-5 rounded border border-border bg-surface flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
            <h2 className="font-medium text-sm text-text-primary">Urgent Gaps</h2>
            <Link to="/gaps" className="font-mono text-[10px] text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1">
              FULL QUEUE <ArrowRight size={11} />
            </Link>
          </div>
          
          <div className="flex-1 min-h-0">
            {topGaps.length === 0 ? (
              <div className="h-full flex items-center justify-center font-mono text-xs text-text-tertiary py-8 text-center">
                NO STATUTORY BREACHES RECORDED
              </div>
            ) : (
              <GapList
                gaps={topGaps}
                selectedId={null}
                onSelect={(id) => navigate(`/gaps?select=${encodeURIComponent(id)}`)}
                visibleRows={4}
              />
            )}
          </div>
        </div>
      </div>

      {/* 4. CHRONOLOGICAL AUDIT & COMMIT LEDGER */}
      {(summary.timeline.length > 0 || summary.recent_commits.length > 0) && (
        <div className="p-5 rounded border border-border bg-surface space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <h2 className="font-medium text-sm text-text-primary">Forensic Activity Ledger</h2>
              <span className="font-mono text-[10px] text-text-tertiary">
                ({unifiedActivity.length} events logged)
              </span>
            </div>
            <Link to="/audit" className="font-mono text-[10px] text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1">
              COMPLETE AUDIT TRAIL <ArrowRight size={11} />
            </Link>
          </div>
          
          <div className="space-y-2">
            {unifiedActivity.map((activity, idx) => (
              <div 
                key={activity.id + idx} 
                onClick={() => activity.type === 'commit' && selectCommit(activity.id)}
                className="flex items-start justify-between gap-3 p-2.5 rounded border border-border/60 bg-bg hover:bg-surface-elevated/70 transition-colors text-xs cursor-pointer group"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5 text-text-tertiary group-hover:text-text-primary transition-colors flex-shrink-0">
                    {activity.type === 'timeline' ? (
                      <Scale size={14} strokeWidth={1.75} />
                    ) : (
                      <GitCommit size={14} strokeWidth={1.75} className={activity.impact ? 'text-status-gap' : ''} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-text-primary truncate">{activity.title}</span>
                      {activity.impact && (
                        <span className="font-mono text-[9px] uppercase px-1.5 py-0.2 rounded border border-status-gap/30 bg-status-gap/10 text-status-gap">
                          Compliance Impact
                        </span>
                      )}
                      {activity.tag && (
                        <span className="font-mono text-[9px] uppercase px-1.5 py-0.2 rounded border border-border bg-bg-subtle text-text-tertiary">
                          {activity.tag}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-text-secondary mt-0.5 truncate">
                      {activity.meta}
                    </div>
                  </div>
                </div>

                <span className="font-mono text-[10px] text-text-tertiary whitespace-nowrap flex-shrink-0 pt-0.5">
                  {new Date(activity.date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}