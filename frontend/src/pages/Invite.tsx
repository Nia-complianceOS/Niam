import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { acceptInvite, httpStatus, previewInvite } from '@/services/api/client'
import type { InvitePreview } from '@/types/api'
import { withNext } from '@/lib/redirect'
import { AuthNotice } from '@/components/auth/AuthNotice'
import { GitHubSignInButton, OrDivider } from '@/components/auth/GitHubSignInButton'
import { PublicShell, primaryLinkClass, secondaryLinkClass } from '@/components/auth/PublicShell'
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/components/team/roles'
import { useSEO } from '@/hooks/useSEO'

type Preview =
  | { kind: 'loading' }
  | { kind: 'ready'; invite: InvitePreview }
  // 404: used, revoked, expired or never existed. The server does not say
  // which, and neither do we.
  | { kind: 'invalid'; message: string }
  // Could not ask (backend down, network). Worth a retry.
  | { kind: 'unavailable'; message: string }

/**
 * /invite/:token -- opened from a link an owner shared. Public, because
 * the person opening it is often not signed in yet (or has no account).
 * Signing in or up from here comes back here via ?next=, and joining
 * switches the browser into the new workspace.
 */
export default function Invite() {
  useSEO({ title: 'Workspace invitation', description: 'Join a Niam compliance workspace.' })

  const { token = '' } = useParams()
  const { isAuthenticated, isLoading, user, workspaces, switchWorkspace } = useAuth()
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' })
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const here = `/invite/${encodeURIComponent(token)}`

  useEffect(() => {
    let live = true
    setPreview({ kind: 'loading' })
    previewInvite(token)
      .then((invite) => live && setPreview({ kind: 'ready', invite }))
      .catch((err: Error) => {
        if (!live) return
        if (httpStatus(err) === 404) {
          setPreview({ kind: 'invalid', message: err.message || 'This invite link is invalid or has expired.' })
        } else {
          setPreview({ kind: 'unavailable', message: err.message || 'Could not load this invitation.' })
        }
      })
    return () => {
      live = false
    }
  }, [token, attempt])

  const join = useCallback(async () => {
    setJoining(true)
    setJoinError(null)
    try {
      const joined = await acceptInvite(token)
      // Reloads into the new workspace.
      switchWorkspace(joined.workspace_id)
    } catch (err) {
      setJoinError((err as Error).message || 'Could not join the workspace.')
      setJoining(false)
    }
  }, [token, switchWorkspace])

  if (preview.kind === 'loading' || isLoading) {
    return (
      <PublicShell eyebrow="Invitation">
        <p className="text-xs text-text-secondary flex items-center gap-2" aria-live="polite">
          <Loader2 size={14} className="animate-spin text-text-tertiary" aria-hidden="true" />
          Checking the invitation…
        </p>
      </PublicShell>
    )
  }

  if (preview.kind === 'invalid') {
    return (
      <PublicShell eyebrow="Invitation">
        <h1 className="font-serif text-2xl font-medium text-text-primary mb-4">This invitation can&apos;t be used</h1>
        <AuthNotice tone="error">
          {preview.message} An invite link works once and expires after 7 days. Ask the workspace owner for a new one.
        </AuthNotice>
        <div className="mt-5 flex gap-3">
          <Link to={isAuthenticated ? '/dashboard' : '/login'} className={secondaryLinkClass}>
            {isAuthenticated ? 'Go to your dashboard' : 'Sign in'}
          </Link>
        </div>
      </PublicShell>
    )
  }

  if (preview.kind === 'unavailable') {
    return (
      <PublicShell eyebrow="Invitation">
        <h1 className="font-serif text-2xl font-medium text-text-primary mb-4">We couldn&apos;t open this invitation</h1>
        <AuthNotice tone="error" title="Niam could not be reached">
          {preview.message}
        </AuthNotice>
        <div className="mt-5">
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={secondaryLinkClass}>
            <RefreshCw size={13} aria-hidden="true" /> Try again
          </button>
        </div>
      </PublicShell>
    )
  }

  const { invite } = preview
  const alreadyMember = workspaces.some((w) => w.workspace_id === invite.workspace_id)

  return (
    <PublicShell eyebrow="Invitation">
      <h1 className="font-serif text-2xl md:text-[28px] leading-tight font-medium text-text-primary mb-3">
        You&apos;ve been invited to {invite.workspace_name} as {article(ROLE_LABEL[invite.role])}{' '}
        {ROLE_LABEL[invite.role]}
      </h1>
      <p className="text-xs text-text-secondary leading-relaxed mb-1">
        {ROLE_LABEL[invite.role]}: {ROLE_DESCRIPTION[invite.role]}
      </p>
      <p className="font-mono text-[11px] text-text-tertiary mb-7">Link expires {formatDateTime(invite.expires_at)}</p>

      {isAuthenticated ? (
        <div className="space-y-4">
          {joinError && <AuthNotice tone="error">{joinError}</AuthNotice>}
          {alreadyMember ? (
            <>
              <AuthNotice tone="info">You&apos;re already a member of {invite.workspace_name}.</AuthNotice>
              <button type="button" onClick={() => switchWorkspace(invite.workspace_id)} className={primaryLinkClass}>
                Open {invite.workspace_name}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void join()} disabled={joining} className={`${primaryLinkClass} w-full`}>
              {joining && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {joining ? 'Joining…' : `Join ${invite.workspace_name}`}
            </button>
          )}
          <p className="text-[11px] text-text-tertiary">
            Signed in as <span className="text-text-secondary">{user?.email}</span>. Not you?{' '}
            <Link to={withNext('/login', here)} className="underline underline-offset-4 hover:text-text-primary">
              Use another account
            </Link>
          </p>
        </div>
      ) : (
        <div className="rounded border border-border bg-surface p-6">
          <p className="text-xs text-text-secondary mb-4">Sign in or create an account to accept. You&apos;ll come straight back here.</p>
          <GitHubSignInButton returnTo={here} />
          <OrDivider />
          <div className="grid grid-cols-2 gap-3">
            <Link to={withNext('/login', here)} className={primaryLinkClass}>
              Sign in
            </Link>
            <Link to={withNext('/signup', here)} className={secondaryLinkClass}>
              Create account
            </Link>
          </div>
        </div>
      )}
    </PublicShell>
  )
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
