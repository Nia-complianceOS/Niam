import { CheckCircle2, Clock, ExternalLink, FileText, GitPullRequest, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { Gap } from '@/types/api'
import {
  dataTypeLabel,
  kindCopy,
  severityClasses,
  SEVERITY_LABELS,
  readableActionError,
} from '@/lib/gapLanguage'

interface Props {
  gap: Gap | null
  fixLoading: boolean
  prLoading: boolean
  actionError?: string | null
  onGenerateFix: () => void
  onOpenPR: () => void
}

/**
 * One finding, explained for the person who has to sign it off.
 *
 * Written for a lawyer rather than the engineer who built the scanner:
 * what was found, why it matters, and what the proposed change would do.
 * The markdown of the amendment is not shown here -- it is reviewed in the
 * pull request, where it belongs.
 */
export function GapDetail({
  gap,
  fixLoading,
  prLoading,
  actionError,
  onGenerateFix,
  onOpenPR,
}: Props) {
  if (!gap) {
    return (
      <Card className="p-5 h-full flex items-center justify-center text-center">
        <div className="text-text-faint text-[13px] max-w-[240px] leading-relaxed">
          Select a finding on the left to see what was detected and what the
          suggested fix would change.
        </div>
      </Card>
    )
  }

  const copy = kindCopy(gap.kind)
  const hasDrafts = gap.remediation_drafts.length > 0
  const target = gap.remediation_drafts.find((d) => d.file_path)?.file_path

  return (
    <Card className="p-5 flex flex-col h-full">
      <div className="flex items-start gap-2.5 mb-1">
        <span
          className={`text-[10px] font-semibold px-1.5 py-[3px] rounded border uppercase tracking-wide ${severityClasses(
            gap.severity
          )}`}
        >
          {SEVERITY_LABELS[gap.severity ?? ''] ?? 'Unrated'}
        </span>
        <div className="font-display text-[15px] font-semibold leading-snug">
          {copy.label}
        </div>
      </div>

      <p className="text-[13px] text-text-dim leading-relaxed mb-4">
        {copy.meaning}
      </p>

      <Field label="Data involved">
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
      </Field>

      {gap.vendor && (
        <Field label="Goes to">
          <div className="text-[13.5px] font-medium">{gap.vendor}</div>
        </Field>
      )}

      {gap.source_file && (
        <Field label="Found in">
          <div className="text-[12.5px] font-mono text-text-dim">
            {gap.source_file}
          </div>
        </Field>
      )}

      {gap.coverage_basis && gap.coverage_basis !== 'none' && (
        <Field label="Basis">
          <div className="text-[12.5px] text-text-dim leading-relaxed">
            {gap.coverage_basis === 'specific'
              ? 'A clause of the DPDP Act names this category of data directly.'
              : 'No clause names this category directly; the Act’s general obligations over personal data apply to it.'}
          </div>
        </Field>
      )}

      <Field label="What the fix does" last>
        <div className="text-[12.5px] text-text-dim leading-relaxed">
          {copy.fix}
        </div>
      </Field>

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

      <div className="mt-auto pt-4">
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
            {gap.pr_url && (
              <a
                href={gap.pr_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] text-accent-blue hover:underline"
              >
                Open the review <ExternalLink size={12} />
              </a>
            )}
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
          <>
            <div className="flex items-start gap-2.5 p-3 mb-3 rounded-[10px] bg-accent-green/5 border border-accent-green/15">
              <FileText size={15} className="text-accent-green mt-[2px]" />
              <div>
                <div className="text-[12.5px] font-semibold">
                  Amendment drafted
                </div>
                <div className="text-[11.5px] text-text-dim mt-0.5">
                  {target
                    ? `Adds a new section to ${target}. Nothing else in the document changes.`
                    : 'Drafted, but no document is linked to this finding yet.'}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="block"
              onClick={onOpenPR}
              disabled={prLoading}
            >
              <GitPullRequest size={14} />
              {prLoading ? 'Sending for review…' : 'Send for legal review'}
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

function Field({
  label,
  children,
  last,
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div className={last ? '' : 'mb-3.5'}>
      <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-1.5">
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
      <span className="flex flex-col items-start">{children}</span>
    </div>
  )
}
