import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { Gap } from '@/types/api'
import { Sparkles, GitPullRequest, CheckCircle2, Clock } from 'lucide-react'

interface Props {
  gap: Gap | undefined
  fixLoading: boolean
  actionError?: string | null
  onGenerateFix: () => void
  onOpenPR: () => void
}

export function ComplianceImpactPanel({ gap, fixLoading, actionError, onGenerateFix, onOpenPR }: Props) {
  return (
    <Card className="p-5">
      <div className="font-display text-[15px] font-semibold mb-1">Compliance Impact</div>
      <div className="text-xs text-text-faint mb-[18px]">
        {gap ? 'New third-party data flow detected — review before merge' : 'Select a commit to see how it affects your compliance posture'}
      </div>

      {!gap ? (
        <div className="flex flex-col items-center justify-center text-center py-11 px-5 text-text-faint gap-2.5">
          <div className="text-2xl opacity-50">✓</div>
          <p className="text-[12.5px] max-w-[220px] leading-relaxed">
            This commit doesn't introduce any new vendors, data collection, or regulatory exposure.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[26px]">
          <div>
            <Section label="New Vendor">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                <span className="w-2 h-2 rounded-full bg-accent-amber" />
                {gap.vendor}
              </div>
            </Section>

            <Section label="Data Collected">
              <div className="flex flex-wrap gap-1.5">
                {gap.data_types.map((d) => (
                  <span key={d} className="text-[11.5px] px-[9px] py-1 rounded-[7px] bg-white/5 border border-border-soft font-mono">
                    {d}
                  </span>
                ))}
              </div>
            </Section>

            <Section label="Affected Documents">
              <div className="flex flex-col gap-1.5">
                {gap.affected_documents.map((doc) => (
                  <div key={doc} className="flex items-center gap-2 text-[13px]">
                    <span className="text-accent-red text-[11px]">✕</span>
                    {doc}
                  </div>
                ))}
              </div>
            </Section>

            <Section label="Required Regulations" last>
              <div className="flex gap-1.5 flex-wrap">
                {gap.regulations.map((r) => (
                  <span key={r} className="reg-badge">
                    {r}
                  </span>
                ))}
              </div>
            </Section>
          </div>

          <div className="flex flex-col">
            <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">AI Recommendation</div>
            <div className="bg-accent-blue/[0.06] border border-accent-blue/[0.18] rounded-card-sm p-3.5 text-[12.5px] leading-relaxed text-[#d3daf5] mb-4">
              {gap.ai_recommendation}
            </div>

            {actionError && (
              <div className="mb-3 px-3.5 py-2.5 rounded-[10px] bg-accent-red/10 border border-accent-red/25 text-[12px] text-[#f5b7b9] leading-relaxed">
                {actionError}
              </div>
            )}

            <div className="mt-auto">
              {gap.status === 'resolved' ? (
                <StatusBanner
                  icon={<CheckCircle2 size={15} />}
                  tone="good"
                  text={gap.pr_id ? `Resolved · PR #${gap.pr_id} merged` : 'Resolved'}
                />
              ) : gap.status === 'pr_opened' ? (
                <StatusBanner
                  icon={<Clock size={15} />}
                  tone="neutral"
                  text={gap.pr_id ? `PR #${gap.pr_id} opened — awaiting legal review` : 'Awaiting legal review'}
                />
              ) : gap.remediation_drafts.length === 0 ? (
                <Button size="block" onClick={onGenerateFix} disabled={fixLoading}>
                  {fixLoading ? (
                    'Analyzing…'
                  ) : (
                    <>
                      <Sparkles size={14} /> Generate Fix
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">Generated Updates</div>
                  <div className="flex flex-col gap-2.5 mb-4">
                    {gap.remediation_drafts.map((draft, i) => (
                      <div key={i} className="flex gap-2.5 items-start p-2.5 bg-accent-green/5 border border-accent-green/15 rounded-[10px]">
                        <span className="text-accent-green font-mono font-bold text-[13px]">＋</span>
                        <div>
                          <div className="text-[12.5px] font-semibold">{draft.document}</div>
                          <div className="text-xs text-text-dim mt-0.5">{draft.summary}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" size="block" onClick={onOpenPR}>
                    <GitPullRequest size={14} /> Open Compliance PR
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function Section({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={last ? '' : 'mb-4'}>
      <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">{label}</div>
      {children}
    </div>
  )
}

function StatusBanner({ icon, tone, text }: { icon: ReactNode; tone: 'good' | 'neutral'; text: string }) {
  const toneClasses =
    tone === 'good'
      ? 'bg-accent-green/10 border-accent-green/25 text-accent-green'
      : 'bg-white/5 border-border-soft text-text-dim'
  return (
    <div className={`flex items-center gap-2 px-3.5 py-3 rounded-[10px] border text-[13px] font-medium ${toneClasses}`}>
      {icon}
      {text}
    </div>
  )
}
