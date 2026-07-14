import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { ComplianceStatus } from '@/types/api'

const badgeVariants = cva('inline-flex items-center text-[10.5px] font-bold px-2.5 py-1 rounded-full border', {
  variants: {
    tone: {
      good: 'bg-accent-green/10 text-accent-green border-accent-green/25',
      warn: 'bg-accent-amber/10 text-accent-amber border-accent-amber/25',
      gap: 'bg-accent-red/10 text-accent-red border-accent-red/25',
      info: 'bg-accent-blue/10 text-[#a9c1ff] border-accent-blue/25',
      muted: 'bg-white/[0.06] text-text-dim border-border-soft',
    },
  },
  defaultVariants: { tone: 'muted' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

const STATUS_TONE: Record<ComplianceStatus, BadgeProps['tone']> = {
  compliant: 'good',
  warning: 'warn',
  gap: 'gap',
  unknown: 'muted',
}

/** Maps a backend ComplianceStatus straight to the right badge tone. */
export function StatusBadge({ status, children }: { status: ComplianceStatus; children: React.ReactNode }) {
  return <Badge tone={STATUS_TONE[status]}>{children}</Badge>
}