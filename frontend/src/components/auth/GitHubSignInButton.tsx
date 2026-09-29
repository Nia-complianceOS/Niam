import { useState } from 'react'
import { Github, Loader2 } from 'lucide-react'
import { beginGitHubFlow } from '@/lib/githubFlow'
import { startGitHubSignIn } from '@/services/api/client'
import { safeNextPath } from '@/lib/redirect'

/**
 * "Continue with GitHub": signs in, or creates an account on first use.
 *
 * The flow is bound to this tab (lib/githubFlow.ts), so the sign-in can
 * only be finished in the browser that started it. A misconfigured
 * instance answers 503 with a sentence saying so; that sentence is shown
 * here, under the button, rather than a dead click.
 */
export function GitHubSignInButton({
  returnTo,
  label = 'Continue with GitHub',
}: {
  /** Where to land once signed in. Must be a same-origin path. */
  returnTo?: string | null
  label?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const binding = await beginGitHubFlow('login', safeNextPath(returnTo) ?? '/repositories')
      const { authorize_url } = await startGitHubSignIn(binding)
      window.location.assign(authorize_url)
      // Leave the spinner on: the page is navigating away.
    } catch (err) {
      setError((err as Error).message || 'Could not start GitHub sign-in.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        aria-describedby={error ? 'github-signin-error' : undefined}
        className="w-full py-2.5 px-4 rounded text-xs font-medium border border-border-strong bg-bg text-text-primary hover:bg-surface-raised disabled:opacity-60 transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Github size={15} strokeWidth={1.75} aria-hidden="true" />
        )}
        <span>{busy ? 'Opening GitHub…' : label}</span>
      </button>
      {error && (
        <p
          id="github-signin-error"
          role="alert"
          className="text-[11px] leading-relaxed text-status-gap"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/** The hairline "or" rule between GitHub and the email form. */
export function OrDivider({ label = 'or with email' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 my-5" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
