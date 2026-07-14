import type { TimelineStep } from '@/types/api'

interface Props {
  steps: TimelineStep[]
}

export function ComplianceTimeline({ steps }: Props) {
  return (
    <div className="rounded-[18px] border border-border-soft bg-card p-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-accent-blue mb-3">
        Compliance timeline
      </div>
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={`${step.title}-${index}`} className="flex items-start gap-3">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-accent-blue/80" />
            <div>
              <div className="text-sm font-medium text-text">{step.title}</div>
              <div className="text-xs text-text-dim">{step.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}