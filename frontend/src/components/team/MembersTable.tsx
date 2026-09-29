import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { TeamMember, WorkspaceRole } from '@/types/api'
import { changeMemberRole, removeMember } from '@/services/api/client'
import { ROLE_LABEL, ROLE_OPTIONS } from './roles'
import { InlineError, buttonDanger, buttonSecondary, formatDate } from './ui'

/**
 * Who is in the workspace. Owners change roles and remove people; the
 * workspace creator (user_id == workspace id) is fixed as owner and
 * cannot be removed -- the server refuses too, and its sentence is shown
 * if it does.
 */
export function MembersTable({
  members,
  creatorId,
  myUserId,
  isOwner,
  onChanged,
}: {
  members: TeamMember[]
  creatorId: string
  myUserId: string
  isOwner: boolean
  onChanged: () => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] font-sans">
        <caption className="sr-only">Workspace members</caption>
        <thead>
          <tr className="border-b border-border bg-bg-subtle text-left">
            <th scope="col" className="px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Person</th>
            <th scope="col" className="px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Role</th>
            <th scope="col" className="px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-tertiary hidden sm:table-cell">Joined</th>
            {isOwner && (
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <MemberRow
              key={m.user_id}
              member={m}
              isCreator={m.user_id === creatorId}
              isSelf={m.user_id === myUserId}
              isOwner={isOwner}
              onChanged={onChanged}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MemberRow({
  member,
  isCreator,
  isSelf,
  isOwner,
  onChanged,
}: {
  member: TeamMember
  isCreator: boolean
  isSelf: boolean
  isOwner: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const display = member.name || member.email || 'Unknown member'
  const canEdit = isOwner && !isCreator && !isSelf
  const selectId = `role-${member.user_id}`

  const setRole = async (role: WorkspaceRole) => {
    if (role === member.role) return
    setBusy(true)
    setError(null)
    try {
      await changeMemberRole(member.user_id, role)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await removeMember(member.user_id)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <tr className="border-b border-border-subtle last:border-0 align-top">
      <td className="px-3 py-2.5">
        <div className="text-text-primary font-medium">
          {display}
          {isSelf && <span className="ml-1.5 font-normal text-text-tertiary">(you)</span>}
        </div>
        {member.name && member.email && <div className="text-[12px] text-text-tertiary">{member.email}</div>}
        {isCreator && <div className="text-[11px] text-text-tertiary mt-0.5">Created this workspace</div>}
        {error && (
          <div className="mt-1.5">
            <InlineError>{error}</InlineError>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        {canEdit ? (
          <div className="flex items-center gap-2">
            <label htmlFor={selectId} className="sr-only">
              Role for {display}
            </label>
            <select
              id={selectId}
              value={member.role}
              disabled={busy}
              onChange={(e) => void setRole(e.target.value as WorkspaceRole)}
              className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-text-tertiary disabled:opacity-60"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            {busy && !confirming && <Loader2 size={12} className="animate-spin text-text-tertiary" aria-label="Saving" />}
          </div>
        ) : (
          <span className="text-text-secondary text-xs">{ROLE_LABEL[member.role] ?? member.role}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-text-secondary text-xs hidden sm:table-cell whitespace-nowrap">
        {formatDate(member.joined_at)}
      </td>
      {isOwner && (
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          {canEdit &&
            (confirming ? (
              <span className="inline-flex items-center gap-2">
                <button type="button" onClick={() => void remove()} disabled={busy} className={buttonDanger}>
                  {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                  Remove {member.name || 'member'}
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={buttonSecondary}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={`Remove ${display} from the workspace`}
                className="px-2 py-1 rounded text-xs text-text-tertiary hover:text-status-gap border border-transparent hover:border-status-gap/30 transition-colors"
              >
                Remove
              </button>
            ))}
        </td>
      )}
    </tr>
  )
}
