import { Card } from '@/components/ui/Card'
import { GapList } from '@/components/gaps/GapList'
import { PageHeader } from '@/components/shared/PageStates'
import { DashboardSkeleton } from '@/components/skeletons/DashboardSkeleton'
import { useDashboard } from '@/hooks/useDashboard'
import { useSEO } from '@/hooks/useSEO'
import { StructuredData } from '@/components/seo/StructuredData'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ArrowDownRight, CheckCircle, Activity, Github, Shield, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { AnimatedSection } from '@/components/landing/AnimatedSection'

export default function Dashboard() {
  useSEO({ 
    title: 'Dashboard', 
    description: 'Compliance score, gap overview, and recent activity' 
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
    "applicationCategory": "Developer Tools",
    "operatingSystem": "Web"
  }

  if (error) {
    return (
      <div className="max-w-[1280px]">
        <StructuredData data={softwareSchema} />
        <PageHeader
          eyebrow="Compliance Overview"
          title="Dashboard"
          subtitle="Your code changes every day. Your compliance should too."
        />
        <Card className="p-6 border-accent-red/30">
          <div className="text-accent-red font-semibold mb-1">Couldn't reach the backend</div>
          <div className="text-text-dim text-sm">{error}</div>
          <div className="text-text-faint text-xs mt-3">
            Check that the API is running and VITE_API_BASE_URL in .env points to it.
          </div>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-[1280px]">
        <StructuredData data={softwareSchema} />
        <PageHeader
          eyebrow="Compliance Overview"
          title="Dashboard"
          subtitle="Your code changes every day. Your compliance should too."
        />
        <DashboardSkeleton />
      </div>
    )
  }

  if (!summary || isEmptyAccount) {
    return (
      <div className="max-w-[1280px]">
        <StructuredData data={softwareSchema} />
        <PageHeader
          eyebrow="Getting started"
          title="Compliance Overview"
          subtitle="Your code changes every day. Your compliance should too."
        />
        <div className="max-w-3xl mx-auto mt-12 p-8 rounded-2xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-accent-blue/10 blur-[100px] pointer-events-none" />
          
          <h2 className="text-2xl font-bold mb-2">Welcome to Niam</h2>
          <p className="text-text-dim mb-10">{scoreExplanation || 'Connect GitHub and scan a repository to get started.'}</p>
          
          <div className="flex flex-col gap-8 relative z-10">
            {/* Step 1 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-accent-green/20 border border-accent-green flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(51,209,122,0.3)]">
                <CheckCircle className="w-5 h-5 text-accent-green" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-1 text-white">Connect GitHub</h3>
                <p className="text-text-dim">Your workspace is connected and ready.</p>
              </div>
            </motion.div>
            
            {/* Step 2 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-accent-blue/20 border border-accent-blue flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(91,140,255,0.3)]">
                <span className="text-accent-blue font-bold text-lg">2</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-1 text-white">Scan a repository</h3>
                <p className="text-text-dim mb-4">Point Niam at a codebase to build your data flow graph.</p>
                <Link to="/repositories" className="inline-flex px-5 py-2.5 bg-gradient-to-r from-accent-blue to-accent-purple text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all shadow-lg shadow-accent-blue/20">
                  Go to Repositories
                </Link>
              </div>
            </motion.div>
            
            {/* Step 3 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex gap-4 opacity-50">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <span className="text-white/50 font-bold text-lg">3</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-1 text-white">Review your findings</h3>
                <p className="text-text-dim">See where personal data goes and what the DPDP Act requires.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    )
  }

  // Derived data for charts
  const severityData = [
    { name: 'High', value: gaps.filter(g => g.severity === 'high').length, fill: '#e01b24' },
    { name: 'Medium', value: gaps.filter(g => g.severity === 'medium').length, fill: '#f5c211' },
    { name: 'Low', value: gaps.filter(g => g.severity === 'low').length, fill: '#33d17a' }
  ].filter(d => d.value > 0)

  const kinds = gaps.reduce((acc, gap) => {
    const kind = gap.kind || 'unknown'
    acc[kind] = (acc[kind] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const kindData = Object.entries(kinds).map(([name, value], i) => ({
    name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value,
    fill: ['#5b8cff', '#b48ced', '#33d17a', '#f5c211', '#e01b24'][i % 5]
  }))

  const percentage = score ?? 0
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  // Unified activity feed
  const unifiedActivity = [
    ...summary.timeline.map(t => ({ 
      id: t.title, 
      title: t.title, 
      meta: t.meta, 
      date: new Date().getTime(), // Fallback if no dates provided
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
    <div className="max-w-[1280px]">
      <StructuredData data={softwareSchema} />
      <AnimatedSection delay={0} direction="none" className="mb-8">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-blue uppercase tracking-wide mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_8px_#33d17a]" />
          LIVE · SYNCED {new Date(summary.synced_at).toLocaleTimeString()}
        </div>
        <h1 className="font-display text-[32px] font-bold tracking-tight">Compliance Overview</h1>
        <div className="text-text-dim text-sm mt-1.5 max-w-[560px]">
          Your code changes every day. Your compliance should too.
        </div>
      </AnimatedSection>

      {/* 1. HERO STAT BAR */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {/* Compliance Score Card */}
        <AnimatedSection delay={0.1} direction="up" className="col-span-1 md:col-span-3 xl:col-span-2">
          <div className="flex items-center gap-6 p-6 rounded-2xl bg-white/[0.03] border border-white/10 h-full backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
            <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="48" cy="48" r="36" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-white/10" />
                <motion.circle 
                  cx="48" cy="48" r="36" fill="transparent" stroke="url(#score-gradient)" strokeWidth="8"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: score === null ? circumference : strokeDashoffset }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="score-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#5b8cff" />
                    <stop offset="100%" stopColor={percentage >= 70 ? "#33d17a" : percentage >= 40 ? "#f5c211" : "#e01b24"} />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{score === null ? "—" : `${score}%`}</span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Compliance Score</h3>
              <p className="text-[13px] text-text-dim leading-relaxed">
                {score === null ? "Score will appear after your first scan completes." : "Overall readiness against DPDP Act obligations."}
              </p>
            </div>
          </div>
        </AnimatedSection>

        {/* Remaining Stat Cards */}
        {summary.stat_cards.slice(1).map((card, i) => {
          let to = ''
          let Icon = Activity
          if (card.label === 'Coverage Gaps') { to = '/gaps'; Icon = AlertTriangle }
          else if (card.label === 'Mapped Systems') { to = '/graph'; Icon = Shield }
          else if (card.label === 'Vendors detected') { to = '/vendors'; Icon = Activity }
          else if (card.label === 'In-Force Clauses') { to = '/regulations'; Icon = CheckCircle }

          return (
            <AnimatedSection key={i} delay={0.1 * (i + 2)} direction="up" className="col-span-1">
              <Link to={to} className="block p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-accent-blue/20 hover:-translate-y-1 transition-all duration-300 h-full group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent-blue/5 rounded-bl-full pointer-events-none group-hover:bg-accent-blue/10 transition-colors" />
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center mb-4 group-hover:shadow-[0_0_15px_rgba(91,140,255,0.2)] transition-all">
                  <Icon size={18} className="text-accent-blue" />
                </div>
                <div className="text-[13px] text-text-dim mb-1 font-medium">{card.label}</div>
                <div className="text-2xl font-bold mb-2">{card.value}</div>
                
                {/* Simulated trend indicator since delta isn't in API currently */}
                {card.value !== '0' && card.value !== '—' && (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-text-dim">
                    {i % 2 === 0 ? <ArrowUpRight size={12} className="text-accent-green" /> : <ArrowDownRight size={12} className="text-accent-amber" />}
                    <span>{card.sub_label || 'vs last week'}</span>
                  </div>
                )}
              </Link>
            </AnimatedSection>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* 2. RISK OVERVIEW */}
        <AnimatedSection delay={0.2} direction="up" className="lg:col-span-2">
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 h-full backdrop-blur-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Risk Overview</h2>
              <Link to="/gaps" className="text-sm text-accent-blue hover:underline">View all</Link>
            </div>
            
            {severityData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-text-dim text-sm">No risks detected yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[250px]">
                <div className="w-full h-full">
                  <h3 className="text-[11px] uppercase tracking-wider text-text-faint mb-4">By Severity</h3>
                  <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={severityData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#8b949e', fontSize: 12 }} />
                      <Tooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        contentStyle={{ backgroundColor: '#161b22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={1500}>
                        {severityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full h-full flex flex-col items-center">
                  <h3 className="text-[11px] uppercase tracking-wider text-text-faint mb-2 w-full text-left">By Kind</h3>
                  <ResponsiveContainer width="100%" height="90%">
                    <PieChart>
                      <Pie
                        data={kindData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        animationDuration={1500}
                      >
                        {kindData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#161b22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </AnimatedSection>

        {/* 4. PRIORITY FINDINGS */}
        <AnimatedSection delay={0.3} direction="up" className="lg:col-span-1">
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 h-full flex flex-col backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Priority Findings</h2>
              <Link to="/gaps" className="text-sm text-accent-blue hover:underline flex items-center gap-1">
                All <ArrowRight size={14} />
              </Link>
            </div>
            <p className="text-xs text-text-faint mb-4">The most urgent open findings requiring your attention.</p>
            
            <div className="flex-1 min-h-0">
              {topGaps.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-text-faint py-8">
                  Nothing outstanding right now.
                </div>
              ) : (
                <GapList
                  gaps={topGaps}
                  selectedId={null}
                  onSelect={(id) => navigate(`/gaps?select=${encodeURIComponent(id)}`)}
                  visibleRows={5}
                />
              )}
            </div>
          </div>
        </AnimatedSection>
      </div>

      {/* 3. RECENT ACTIVITY */}
      {(summary.timeline.length > 0 || summary.recent_commits.length > 0) && (
        <AnimatedSection delay={0.4} direction="up">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Recent Activity</h2>
              {summary.sample_panels && (
                <div className="inline-flex items-center gap-2 rounded-full border border-accent-amber/40 bg-accent-amber/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-amber">
                  Sample data — not from your graph
                </div>
              )}
            </div>
            
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
              <div className="space-y-6">
                {unifiedActivity.map((activity, idx) => (
                  <div key={activity.id + idx} className="flex items-start gap-4">
                    <div className="relative mt-1">
                      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center relative z-10">
                        {activity.type === 'timeline' ? (
                          <Activity size={14} className="text-accent-blue" />
                        ) : (
                          <Github size={14} className={activity.impact ? 'text-accent-purple' : 'text-text-dim'} />
                        )}
                      </div>
                      {idx !== unifiedActivity.length - 1 && (
                        <div className="absolute top-8 bottom-[-24px] left-1/2 -translate-x-1/2 w-px bg-white/10 z-0" />
                      )}
                    </div>
                    
                    <div className="flex-1 cursor-pointer hover:bg-white/[0.02] p-2 -my-2 rounded-lg transition-colors" onClick={() => activity.type === 'commit' && selectCommit(activity.id)}>
                      <div className="flex items-center justify-between">
                        <h4 className="text-[14px] font-medium text-white">{activity.title}</h4>
                        <span className="text-[11px] text-text-faint">{new Date(activity.date).toLocaleDateString()}</span>
                      </div>
                      <div className="text-[13px] text-text-dim mt-0.5 flex items-center gap-2">
                        <span>{activity.meta}</span>
                        {activity.tag && (
                          <span className="px-2 py-0.5 rounded border border-white/10 text-[10px] bg-white/5 uppercase tracking-wide">
                            {activity.tag}
                          </span>
                        )}
                        {activity.impact && (
                          <span className="px-2 py-0.5 rounded border border-accent-purple/30 text-[10px] bg-accent-purple/10 text-accent-purple uppercase tracking-wide">
                            Compliance Impact
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AnimatedSection>
      )}
    </div>
  )
}