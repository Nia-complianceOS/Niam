import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Github, KeyRound, Loader2, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { setPassword, unlinkGitHubSignIn } from '@/services/api/client'
import { RoleBadge } from './RoleBadge'
import { ROLE_DESCRIPTION } from './roles'
import { InlineError, Panel, SectionHeading, buttonPrimary, buttonSecondary, inputClass } from './ui'

/**
 * Settings → Account: who you are, which workspace you are acting in, and
 * the ways you can sign in (password, GitHub).
 */
export function AccountSettings() {
  const { user, role, workspaces, workspaceId } = useAuth()
  const current = workspaces.find((w) => w.workspace_id === workspaceId)

  return (
    <section aria-labelledby="account-heading" className="space-y-4">
      <SectionHeading id="account-heading" eyebrow="Account" title="Account & workspace" />

      <Panel className="divide-y divide-border-subtle">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <div className="text-text-primary font-medium">{user?.name}</div>
            <div className="text-text-tertiary">{user?.email}</div>
          </div>
        </div>
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-text-primary">
              <span className="font-medium">{current?.name ?? 'Current workspace'}</span>
              <RoleBadge role={role} />
            </div>
            {role && <div className="text-text-tertiary mt-0.5">{ROLE_DESCRIPTION[role]}</div>}
          </div>
          <Link to="/team" className={buttonSecondary}>
            <Users size={13} aria-hidden="true" />
            {role === 'owner' ? 'Manage team & invites' : 'View team'}
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>
      </Panel>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-2">Sign-in methods</div>
        <Panel className="divide-y divide-border-subtle">
          <PasswordMethod />
          <GitHubMethod />
        </Panel>
      </div>
    </section>
  )
}

function PasswordMethod() {
  const { hasPassword, refreshAccount } = useAuth()
  const [open, setOpen] = useState(!hasPassword)
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const tooShort = pw.length > 0 && pw.length < 8
  const mismatch = confirm.length > 0 && pw !== confirm
  const valid = pw.length >= 8 && pw.length <= 128 && pw === confirm

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await setPassword(pw)
      setPw('')
      setConfirm('')
      setSaved(true)
      setOpen(false)
      await refreshAccount().catch(() => undefined)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <KeyRound size={15} strokeWidth={1.75} className="text-text-tertiary mt-0.5" aria-hidden="true" />
          <div>
            <div className="text-text-primary font-medium">Email and password</div>
            <div className="text-text-tertiary mt-0.5">
              {hasPassword ? 'A password is set.' : 'Add a password so you can also sign in with email.'}
            </div>
            {saved && (
              <div role="status" className="text-status-compliant mt-1">
                Password saved.
              </div>
            )}
          </div>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className={buttonSecondary} aria-expanded={false}>
            {hasPassword ? 'Change password' : 'Add a password'}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-3 pl-[26px] space-y-2.5 max-w-sm">
          <div className="space-y-1">
            <label htmlFor="new-password" className="block text-xs font-medium text-text-secondary">
              {hasPassword ? 'New password' : 'Password'}
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              aria-invalid={tooShort}
              aria-describedby="new-password-help"
              className={`${inputClass} w-full`}
            />
            <p id="new-password-help" className={`text-[11px] ${tooShort ? 'text-status-gap' : 'text-text-tertiary'}`}>
              At least 8 characters.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="confirm-password" className="block text-xs font-medium text-text-secondary">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
              className={`${inputClass} w-full`}
            />
            {mismatch && <p className="text-[11px] text-status-gap">The passwords don&apos;t match.</p>}
          </div>
          <InlineError>{error}</InlineError>
          <div className="flex gap-2">
            <button type="submit" disabled={!valid || busy} className={buttonPrimary}>
              {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              Save password
            </button>
            {hasPassword && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setPw('')
                  setConfirm('')
                  setError(null)
                }}
                className={buttonSecondary}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

function GitHubMethod() {
  const { githubLogin, hasPassword, refreshAccount } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unlink = async () => {
    setBusy(true)
    setError(null)
    try {
      await unlinkGitHubSignIn()
      setConfirming(false)
      await refreshAccount().catch(() => undefined)
    } catch (err) {
      // 409: GitHub is the only way in. The server's sentence says so.
      setError((err as Error).message)
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Github size={15} strokeWidth={1.75} className="text-text-tertiary mt-0.5" aria-hidden="true" />
          <div>
            <div className="text-text-primary font-medium">GitHub</div>
            <div className="text-text-tertiary mt-0.5">
              {githubLogin ? (
                <>
                  Linked as <span className="font-mono text-text-secondary">@{githubLogin}</span> — Continue with GitHub signs you in.
                </>
              ) : (
                <>
                  Not linked. Connecting GitHub on{' '}
                  <Link to="/repositories" className="underline underline-offset-4 hover:text-text-primary">
                    Repositories
                  </Link>{' '}
                  in a workspace you own links it for sign-in.
                </>
              )}
            </div>
            {githubLogin && !hasPassword && (
              <div className="text-text-tertiary mt-1">Add a password before unlinking — GitHub is currently your only way to sign in.</div>
            )}
          </div>
        </div>
        {githubLogin &&
          (confirming ? (
            <span className="inline-flex gap-2">
              <button
                type="button"
                onClick={() => void unlink()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-status-gap/40 bg-status-gap/10 text-status-gap hover:bg-status-gap/20 disabled:opacity-50 transition-colors"
              >
                {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                Unlink @{githubLogin}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={buttonSecondary}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={buttonSecondary}>
              Unlink
            </button>
          ))}
      </div>
      {confirming && (
        <p className="mt-2 pl-[26px] text-text-tertiary">
          You will no longer be able to use Continue with GitHub. Repository access for scans is not affected.
        </p>
      )}
      {error && (
        <div className="mt-2 pl-[26px]">
          <InlineError>{error}</InlineError>
        </div>
      )}
    </div>
  )
}
