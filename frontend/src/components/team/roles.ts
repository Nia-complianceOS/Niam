import type { WorkspaceRole } from '@/types/api'

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  legal: 'Legal reviewer',
  member: 'Member',
}

/** Short form for badges. */
export const ROLE_SHORT: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  legal: 'Legal',
  member: 'Member',
}

export const ROLE_DESCRIPTION: Record<WorkspaceRole, string> = {
  owner: 'Gives final approval, connects GitHub and invites people.',
  legal: 'Edits and approves drafted fixes before they reach the owner.',
  member: 'Runs scans and drafts fixes.',
}

/** Order used in selects: the common invite first. */
export const ROLE_OPTIONS: WorkspaceRole[] = ['legal', 'member', 'owner']

export function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABEL[role as WorkspaceRole]) || 'Member'
}
