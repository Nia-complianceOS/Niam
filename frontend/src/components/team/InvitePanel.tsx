import { useState } from 'react'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'
import type { InviteCreated, InviteSummary, WorkspaceRole } from '@/types/api'
import { createInvite, revokeInvite } from '@/services/api/client'
import { ROLE_LABEL, ROLE_OPTIONS } from './roles'
import { InlineError, buttonPrimary, buttonSecondary, formatDate, formatDateTime, inputClass } from './ui'

/**
 * Owners create single-use invite links. The token is shown exactly once
 * (the server stores only its hash), so the link is displayed here with a
 * copy button and never again.
 */
export function InviteCreator({ onCreated }: { onCreated: () => void }) {
  const [role, setRole] = useState<WorkspaceRole>('legal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<InviteCreated | null>(null)
  const [copied, setCopied] = useState(false)

  const link = created ? `${window.location.origin}/invite/${created.token}` : ''

  const create = async () => {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setCreated(await createInvite(role))
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked (insecure origin, permissions). The link
      // is in a read-only field the person can select by hand.
      const el = document.getElementById('invite-link') as HTMLInputElement | null
      el?.select()
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="invite-role" className="block text-xs font-medium text-text-secondary">
            Invite as
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
            className={`${inputClass} pr-7`}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => void create()} disabled={busy} className={buttonPrimary}>
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Link2 size={13} aria-hidden="true" />}
          Create invite link
        </button>
      </div>
      <InlineError>{error}</InlineError>

      {created && (
        <div className="rounded border border-border bg-bg-subtle p-3 space-y-2" aria-live="polite">
          <label htmlFor="invite-link" className="block text-xs font-medium text-text-primary">
            Invite link for {articleFor(ROLE_LABEL[created.role])} {ROLE_LABEL[created.role]}
          </label>
          <div className="flex gap-2">
            <input
              id="invite-link"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className={`${inputClass} flex-1 min-w-0 font-mono text-[12px]`}
            />
            <button type="button" onClick={() => void copy()} className={buttonSecondary} aria-label="Copy invite link">
              {copied ? <Check size={13} className="text-status-compliant" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-text-tertiary">
            Shown once — copy it now. It works for one person, once, and expires in 7 days ({formatDateTime(created.expires_at)}). Anyone with the link can join, so send it directly to the person.
          </p>
        </div>
      )}
    </div>
  )
}

export function InviteList({ invites, onChanged }: { invites: InviteSummary[]; onChanged: () => void }) {
  if (invites.length === 0) {
    return <p className="px-4 py-3 text-xs text-text-tertiary">No invites yet.</p>
  }
  return (
    <ul className="divide-y divide-border-subtle">
      {invites.map((inv) => (
        <InviteRow key={inv.id} invite={inv} onChanged={onChanged} />
      ))}
    </ul>
  )
}

function InviteRow({ invite, onChanged }: { invite: InviteSummary; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const expired = new Date(invite.expires_at).getTime() < Date.now()
  const status = invite.used_at ? 'Used' : expired ? 'Expired' : 'Active'

  const revoke = async () => {
    setBusy(true)
    setError(null)
    try {
      await revokeInvite(invite.id)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <li className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="min-w-0">
        <div className="text-text-primary">
          {ROLE_LABEL[invite.role] ?? invite.role}
          <span
            className={`ml-2 font-mono text-[9px] uppercase tracking-wider px-1 py-0.5 rounded-sm border ${
              status === 'Active'
                ? 'border-status-compliant/30 bg-status-compliant/10 text-status-compliant'
                : 'border-border text-text-tertiary'
            }`}
          >
            {status}
          </span>
        </div>
        <div className="text-[11px] text-text-tertiary mt-0.5">
          Created {formatDate(invite.created_at)} ·{' '}
          {invite.used_at ? `used ${formatDate(invite.used_at)}` : `${expired ? 'expired' : 'expires'} ${formatDate(invite.expires_at)}`}
        </div>
        {error && <InlineError>{error}</InlineError>}
      </div>
      {!invite.used_at && (
        <button
          type="button"
          onClick={() => void revoke()}
          disabled={busy}
          aria-label={`${expired ? 'Delete' : 'Revoke'} ${ROLE_LABEL[invite.role] ?? ''} invite created ${formatDate(invite.created_at)}`}
          className="px-2 py-1 rounded text-xs text-text-tertiary hover:text-status-gap border border-transparent hover:border-status-gap/30 transition-colors disabled:opacity-50"
        >
          {busy ? 'Revoking…' : expired ? 'Delete' : 'Revoke'}
        </button>
      )}
    </li>
  )
}

function articleFor(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}
