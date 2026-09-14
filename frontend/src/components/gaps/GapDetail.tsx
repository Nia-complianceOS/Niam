import { useState } from 'react'
import { CheckCircle2, Clock, ExternalLink, GitPullRequest, Sparkles, ArrowLeft, Scale } from 'lucide-react'
import type { Gap } from '@/types/api'
import {
  dataTypeLabel,
  kindCopy,
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

const severityPillClasses: Record<string, string> = {
  high: 'border-status-gap/30 bg-status-gap/10 text-status-gap',
  medium: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  low: 'border-status-compliant/30 bg-status-compliant/10 text-status-compliant',
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
      <div className="p-8 h-full flex flex-col items-center justify-center text-center bg-surface border border-border rounded font-sans text-xs text-text-tertiary space-y-2">
        <Scale size={24} className="opacity-40 mb-1" />
        <div className="font-mono text-[11px] uppercase tracking-wider">
          Finding Inspector Inactive
        </div>
        <p className="max-w-[240px] text-text-secondary leading-relaxed">
          Select a compliance gap from the ledger queue to examine statutory citations, affected code paths, and drafted remedies.
        </p>
      </div>
    )
  }

  const copy = kindCopy(gap.kind)
  const hasDrafts = gap.remediation_drafts.length > 0
  const activeDraft = gap.remediation_drafts[activeTab]
  const severityPill = severityPillClasses[gap.severity ?? ''] || severityPillClasses.low

  return (
    <div className="p-5 flex flex-col h-full bg-surface border border-border rounded overflow-y-auto relative font-sans text-xs">
      {isMobile && (
        <button 
          onClick={onBack}
          className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-xs font-medium mb-4 transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          <span>Return to findings list</span>
        </button>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2.5 mb-5 pb-4 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap font-mono text-[10px]">
          <span className={`px-1.5 py-0.2 rounded border uppercase font-medium ${severityPill}`}>
            {SEVERITY_LABELS[gap.severity ?? ''] ?? 'Unrated Severity'}
          </span>
          <span className="px-1.5 py-0.2 rounded border border-entity-clause/30 bg-entity-clause/10 text-entity-clause uppercase">
            {copy.label}
          </span>
          {gap.status && (
            <span className="px-1.5 py-0.2 rounded border border-border bg-bg text-text-tertiary uppercase">
              {GAP_STATUS_LABELS[gap.status] ?? gap.status}
            </span>
          )}
        </div>
        
        <h2 className="font-serif text-lg sm:text-xl font-medium text-text-primary leading-snug">
          {gap.title}
        </h2>
      </div>

      {/* What the code does */}
      <Field label="01 // Codebase Behavior & Lineage">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-bg rounded border border-border p-3.5">
          <div>
            <div className="font-mono text-[10px] text-text-tertiary mb-1">DATA IDENTIFIERS</div>
            <div className="flex flex-wrap gap-1">
              {gap.data_types.length === 0 ? (
                <span className="text-text-tertiary">Unspecified</span>
              ) : (
                gap.data_types.map((d) => (
                  <span
                    key={d}
                    className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border text-text-secondary"
                  >
                    {dataTypeLabel(d)}
                  </span>
                ))
              )}
            </div>
          </div>
          
          {gap.vendor && (
            <div>
              <div className="font-mono text-[10px] text-text-tertiary mb-1">EGRESS PROCESSOR</div>
              <div className="text-xs font-medium text-text-primary">{gap.vendor}</div>
            </div>
          )}

          {gap.source_file && (
            <div className="sm:col-span-2">
              <div className="font-mono text-[10px] text-text-tertiary mb-0.5">SOURCE PATH</div>
              <div className="font-mono text-[11px] text-text-primary break-all bg-surface px-2 py-1 rounded border border-border">
                {gap.source_file}
              </div>
            </div>
          )}
          
          {gap.source_commit?.sha && (
            <div className="sm:col-span-2">
              <div className="font-mono text-[10px] text-text-tertiary mb-0.5">PROVENANCE COMMIT</div>
              <div className="font-mono text-[11px] text-text-secondary truncate" title={gap.source_commit.message}>
                <span className="text-text-primary font-medium">{gap.source_commit.sha.slice(0, 7)}</span> — {gap.source_commit.message}
              </div>
            </div>
          )}
        </div>
      </Field>

      {/* What the DPDP Act requires */}
      <Field label="02 // Statutory Mandate (DPDP Act 2023)">
        <div className="bg-bg rounded border border-border p-3.5 text-xs text-text-secondary leading-relaxed font-sans">
          {gap.ai_recommendation || copy.fix || copy.meaning}
        </div>
      </Field>

      {/* Remediation */}
      {hasDrafts && (
        <Field label="03 // Drafted Remedial Amendment">
          <div className="flex overflow-x-auto border-b border-border mb-2.5 font-mono text-[11px]">
            {gap.remediation_drafts.map((draft, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-3 py-1.5 font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === idx ? 'border-text-primary text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-primary'
                }`}
              >
                {draft.document}
              </button>
            ))}
          </div>
          
          {activeDraft && (
            <div className="bg-bg rounded border border-border p-3.5 space-y-3">
              <div>
                <div className="font-mono text-[10px] uppercase text-text-tertiary mb-1">Amendment Summary</div>
                <p className="text-xs text-text-secondary leading-relaxed">{activeDraft.summary}</p>
              </div>
              
              {activeDraft.diff_text && (
                <div>
                  <div className="font-mono text-[10px] uppercase text-text-tertiary mb-1">Proposed Policy Clause</div>
                  <pre className="bg-surface p-3 rounded border border-border overflow-x-auto text-[11px] font-mono text-text-primary leading-relaxed">
                    <code>{activeDraft.diff_text}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </Field>
      )}

      {actionError &&
        (() => {
          const { title, message } = readableActionError(actionError)
          return (
            <div className="mt-3 p-3 rounded border border-status-gap/30 bg-status-gap/10 text-xs text-status-gap leading-relaxed space-y-0.5">
              <div className="font-medium font-mono text-[11px]">{title}</div>
              <div className="opacity-90">{message}</div>
            </div>
          )
        })()}

      {/* Action Footer */}
      <div className="mt-auto pt-5 border-t border-border space-y-2.5">
        {gap.status === 'resolved' ? (
          <div className="p-2.5 rounded border border-status-compliant/30 bg-status-compliant/10 text-status-compliant text-xs font-medium flex items-center gap-2">
            <CheckCircle2 size={14} className="flex-shrink-0" />
            <span>Remediated — this statutory breach is no longer detected in repository code.</span>
          </div>
        ) : gap.status === 'pr_opened' ? (
          <div className="p-2.5 rounded border border-border bg-bg text-text-secondary text-xs flex items-center gap-2">
            <Clock size={14} className="flex-shrink-0 text-text-tertiary" />
            <span>
              Pending Legal Review
              {gap.pr_number ? ` · Pull Request #${gap.pr_number}` : ''}.
            </span>
          </div>
        ) : !hasDrafts ? (
          <button
            onClick={onGenerateFix}
            disabled={fixLoading}
            className="w-full py-2 px-3 rounded bg-text-primary text-bg text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-1.5 shadow-xs"
          >
            {fixLoading ? (
              'Drafting Statutory Amendment…'
            ) : (
              <>
                <Sparkles size={13} />
                <span>Draft Remedial Policy Amendment</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={onOpenPR}
            disabled={prLoading}
            className="w-full py-2 px-3 rounded bg-text-primary text-bg text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-1.5 shadow-xs"
          >
            <GitPullRequest size={13} />
            <span>{prLoading ? 'Submitting Pull Request…' : 'Submit for Legal Review via PR'}</span>
          </button>
        )}

        {gap.pr_url && (
          <a
            href={gap.pr_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1 text-xs text-text-primary hover:underline underline-offset-4 font-medium pt-1"
          >
            <span>Inspect Pull Request on GitHub</span>
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
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
    <div className="mb-4">
      <div className="font-mono text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
        {label}
      </div>
      {children}
    </div>
  )
}
