import { useState } from 'react'
import { CheckCircle2, Clock, ExternalLink, GitPullRequest, Sparkles, ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { Gap } from '@/types/api'
import {
  dataTypeLabel,
  kindCopy,
  severityClasses,
  SEVERITY_LABELS,
  readableActionError,
  GAP_STATUS_LABELS,
} from '@/lib/gapLanguage'

interface Props {
  gap: Gap | null
  fixLoading: boolean
  prLoading: boolean
  actionError?: string | null
  onGenerateFix: () => void
  onOpenPR: () => void
  onBack: () => void
  isMobile: boolean
}

export function GapDetail({
  gap,
  fixLoading,
  prLoading,
  actionError,
  onGenerateFix,
  onOpenPR,
  onBack,
  isMobile,
}: Props) {
  const [activeTab, setActiveTab] = useState(0)

  if (!gap) {
    return (
      <Card className="p-5 h-full flex flex-col items-center justify-center text-center bg-surface/50 backdrop-blur-sm border-border-soft/60">
        <div className="text-text-faint text-[14px] max-w-[240px] leading-relaxed">
          <span className="text-4xl block mb-4 opacity-50">👀</span>
          Select a finding to review it
        </div>
      </Card>
    )
  }

  const copy = kindCopy(gap.kind)
  const hasDrafts = gap.remediation_drafts.length > 0
  const activeDraft = gap.remediation_drafts[activeTab]

  return (
    <Card className="p-5 flex flex-col h-full bg-surface/80 backdrop-blur-sm border-border-soft overflow-y-auto relative">
      {isMobile && (
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-text-dim hover:text-text text-[13px] font-medium mb-4 transition-colors w-fit"
        >
          <ArrowLeft size={16} />
          Back to list
        </button>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 mb-6 pb-5 border-b border-border-soft">
        <div className="flex items-start gap-2.5 flex-wrap">
          <span
            className={`text-[10px] font-semibold px-1.5 py-[3px] rounded border uppercase tracking-wide ${severityClasses(
              gap.severity
            )}`}
          >
            {SEVERITY_LABELS[gap.severity ?? ''] ?? 'Unrated'}
          </span>
          <span className="px-2 py-[3px] rounded-full bg-accent-blue/10 border border-accent-blue/20 text-[10px] font-semibold text-accent-blue uppercase tracking-wide">
            {copy.label}
          </span>
          {gap.status && (
            <span className="px-2 py-[3px] rounded-full bg-white/5 border border-border-soft text-[10px] font-medium text-text-dim uppercase tracking-wide">
              {GAP_STATUS_LABELS[gap.status] ?? gap.status}
            </span>
          )}
        </div>
        <div className="font-display text-[18px] font-semibold leading-snug">
          {gap.title}
        </div>
      </div>

      {/* What the code does */}
      <Field label="What the code does">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-black/10 rounded-[10px] p-4 border border-border-soft/50">
          <div>
            <div className="text-[11px] text-text-faint mb-1">Data Types</div>
            <div className="flex flex-wrap gap-1.5">
              {gap.data_types.length === 0 ? (
                <span className="text-[13px] text-text-faint">Not recorded</span>
              ) : (
                gap.data_types.map((d) => (
                  <span
                    key={d}
                    className="text-[12px] px-2 py-[3px] rounded-[7px] bg-white/5 border border-border-soft"
                  >
                    {dataTypeLabel(d)}
                  </span>
                ))
              )}
            </div>
          </div>
          
          {gap.vendor && (
            <div>
              <div className="text-[11px] text-text-faint mb-1">Vendor</div>
              <div className="text-[13px] font-medium text-text">{gap.vendor}</div>
            </div>
          )}

          {gap.source_file && (
            <div>
              <div className="text-[11px] text-text-faint mb-1">Source File</div>
              <div className="text-[12px] font-mono text-text-dim break-all">
                {gap.source_file}
              </div>
            </div>
          )}
          
          {gap.source_commit?.sha && (
            <div>
              <div className="text-[11px] text-text-faint mb-1">Source Commit</div>
              <div className="text-[12px] font-mono text-text-dim truncate" title={gap.source_commit.message}>
                {gap.source_commit.sha.substring(0, 7)} — {gap.source_commit.message}
              </div>
            </div>
          )}
        </div>
      </Field>

      {/* What the DPDP Act requires */}
      <Field label="What the DPDP Act requires">
        <div className="bg-accent-blue/5 border border-accent-blue/20 rounded-[10px] p-4 text-[13px] text-text leading-relaxed">
          {gap.ai_recommendation || copy.fix || copy.meaning}
        </div>
      </Field>

      {/* Remediation */}
      {hasDrafts && (
        <Field label="Remediation">
          <div className="flex overflow-x-auto border-b border-border-soft mb-3 no-scrollbar">
            {gap.remediation_drafts.map((draft, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-4 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === idx ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-dim hover:text-text'
                }`}
              >
                {draft.document}
              </button>
            ))}
          </div>
          
          {activeDraft && (
            <div className="bg-black/20 rounded-[8px] p-4 border border-border-soft/50 text-[12.5px] text-text-dim">
              <div className="font-semibold text-text mb-2 text-[12px] uppercase tracking-wide">Summary</div>
              <div className="mb-4 leading-relaxed">{activeDraft.summary}</div>
              
              {activeDraft.diff_text && (
                <>
                  <div className="font-semibold text-text mb-2 text-[12px] uppercase tracking-wide">Changes</div>
                  <pre className="bg-[#1e1e2e] p-4 rounded-[6px] overflow-x-auto border border-border-soft/30 text-[12px] font-mono leading-relaxed">
                    <code>{activeDraft.diff_text}</code>
                  </pre>
                </>
              )}
            </div>
          )}
        </Field>
      )}

      {actionError &&
        (() => {
          const { title, message } = readableActionError(actionError)
          return (
            <div className="mt-4 px-3.5 py-3 rounded-[10px] bg-accent-red/10 border border-accent-red/25 text-[12px] text-[#f5b7b9] leading-relaxed">
              <div className="font-semibold mb-1">{title}</div>
              <div className="text-[#e8b9bb]">{message}</div>
            </div>
          )
        })()}

      <div className="mt-auto pt-6 border-t border-border-soft/50">
        {gap.status === 'resolved' ? (
          <Banner tone="good" icon={<CheckCircle2 size={15} />}>
            Resolved — this finding is no longer detected.
          </Banner>
        ) : gap.status === 'pr_opened' ? (
          <Banner tone="neutral" icon={<Clock size={15} />}>
            <span>
              With legal for review
              {gap.pr_number ? ` · pull request #${gap.pr_number}` : ''}. You can
              keep working on other findings.
            </span>
          </Banner>
        ) : !hasDrafts ? (
          <Button size="block" onClick={onGenerateFix} disabled={fixLoading}>
            {fixLoading ? (
              'Drafting the amendment…'
            ) : (
              <>
                <Sparkles size={14} /> Draft a fix for this finding
              </>
            )}
          </Button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              size="block"
              onClick={onOpenPR}
              disabled={prLoading}
              className="flex-1"
            >
              <GitPullRequest size={14} />
              {prLoading ? 'Sending for review…' : 'Send for legal review'}
            </Button>
          </div>
        )}

        {gap.pr_url && (
          <a
            href={gap.pr_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 mt-4 text-[13px] text-accent-blue hover:underline font-medium"
          >
            View on GitHub <ExternalLink size={14} />
          </a>
        )}
      </div>
    </Card>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <div className="text-[11.5px] font-semibold text-text-faint uppercase tracking-wide mb-2.5">
        {label}
      </div>
      {children}
    </div>
  )
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'good' | 'neutral'
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const classes =
    tone === 'good'
      ? 'bg-accent-green/10 border-accent-green/25 text-accent-green'
      : 'bg-white/5 border-border-soft text-text-dim'
  return (
    <div
      className={`flex items-start gap-2 px-3.5 py-3 rounded-[10px] border text-[12.5px] font-medium leading-relaxed ${classes}`}
    >
      <span className="mt-[1px] shrink-0">{icon}</span>
      <span className="flex flex-col items-start w-full">{children}</span>
    </div>
  )
}
