import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { RegulationCoverage } from '@/types/api'

function scoreColor(scoreLabel: string | null, enabled: boolean): string {
  if (!enabled || !scoreLabel) return '#5e5e72'
  const pct = parseInt(scoreLabel, 10)
  if (Number.isNaN(pct)) return '#5e5e72'
  if (pct >= 90) return '#33d17a'
  if (pct >= 75) return '#5b8cff'
  return '#f5a623'
}

function AccordionItem({ regulation }: { regulation: RegulationCoverage }) {
  const [open, setOpen] = useState(false)
  const color = scoreColor(regulation.score_label, regulation.enabled)

  return (
    <Card className="mb-3 overflow-hidden">
      <button
        className="w-full px-[22px] py-[18px] flex items-center justify-between"
        onClick={() => setOpen((o) => !o)}
        disabled={!regulation.enabled}
      >
        <div className="flex items-center gap-3.5">
          <div className="font-display text-xl font-bold" style={{ color }}>
            {regulation.score_label ?? '—'}
          </div>
          <div className="text-[14.5px] font-semibold">{regulation.code}</div>
        </div>
        {regulation.enabled && (
          <ChevronDown size={18} className={`text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && regulation.enabled && (
        <div className="border-t border-border-soft px-[22px] py-[18px] grid grid-cols-3 gap-5">
          <AccordionColumn label="Missing Requirements" items={regulation.missing_requirements} />
          <AccordionColumn label="Mapped Controls" items={regulation.mapped_controls} />
          <AccordionColumn label="Affected Systems" items={regulation.affected_systems} />
        </div>
      )}

      {!regulation.enabled && (
        <div className="px-[22px] py-[18px] text-text-faint text-[13px] border-t border-border-soft">
          This framework hasn't been enabled for your workspace yet.
        </div>
      )}
    </Card>
  )
}

function AccordionColumn({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">{label}</div>
      <div className="flex flex-col gap-1.5 text-[12.5px] text-text-dim">
        {items.length === 0 ? <div>—</div> : items.map((item) => <div key={item}>· {item}</div>)}
      </div>
    </div>
  )
}

export function RegulationsAccordion({ regulations }: { regulations: RegulationCoverage[] }) {
  return (
    <div>
      {regulations.map((r) => (
        <AccordionItem key={r.code} regulation={r} />
      ))}
    </div>
  )
}