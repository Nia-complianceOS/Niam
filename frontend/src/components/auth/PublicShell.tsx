import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { NiamLogo } from '@/components/brand/NiamMark'

/** The frame for single-purpose public pages (GitHub completion, invites). */
export function PublicShell({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-bg text-text-primary font-sans flex flex-col">
      <header className="px-6 md:px-10 py-5 border-b border-border">
        <Link to="/" aria-label="Niam home" className="inline-flex rounded">
          <NiamLogo size={20} />
        </Link>
      </header>
      <main id="main-content" className="flex-1 flex items-start justify-center px-6 py-16 md:py-24">
        <div className="w-full max-w-[440px]">
          <span className="font-mono text-[11px] text-text-tertiary uppercase tracking-wider block mb-1.5">
            {eyebrow}
          </span>
          {children}
        </div>
      </main>
    </div>
  )
}

export const primaryLinkClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-medium bg-text-primary text-bg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer'

export const secondaryLinkClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-medium text-text-primary border border-border-strong bg-bg hover:bg-surface-raised disabled:opacity-50 transition-colors cursor-pointer'
