import type { WorkspaceRole } from '@/types/api'
import { ROLE_SHORT } from './roles'

/** Neutral chrome: a role is not a status, so it gets no status colour. */
export function RoleBadge({ role, className = '' }: { role: WorkspaceRole | null; className?: string }) {
  if (!role) return null
  return (
    <span
      className={`inline-flex items-center font-mono text-[9px] uppercase tracking-wider px-1 py-0.5 rounded-sm border border-border bg-bg text-text-tertiary ${className}`}
    >
      {ROLE_SHORT[role] ?? role}
    </span>
  )
}
