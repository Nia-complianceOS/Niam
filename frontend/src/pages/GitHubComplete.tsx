import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { finishGitHubConnect, finishGitHubSignIn, httpStatus } from '@/services/api/client'
import { takeGitHubFlow } from '@/lib/githubFlow'
import { describeSignInFailure, isKnownGitHubReason } from '@/lib/githubMessages'
import { withNext, type AuthPageState } from '@/lib/redirect'
import { PublicShell, primaryLinkClass, secondaryLinkClass } from '@/components/auth/PublicShell'
import { AuthNotice } from '@/components/auth/AuthNotice'
import { useSEO } from '@/hooks/useSEO'

type View =
  | { kind: 'working'; label: string }
  | { kind: 'welcome'; name: string; to: string }
  | { kind: 'failed'; title: string; message: string; links: { label: string; to: string }[] }

const START_AGAIN = [
  { label: 'Back to sign in', to: '/login' },
  { label: 'Repositories', to: '/repositories' },
]

/**
 * Where GitHub (via the backend callback) sends the browser back, for both
 * "Continue with GitHub" and "Connect GitHub".
 *
 *   ?code=…&purpose=login|connect   success at GitHub; finish it here
 *   ?error=<reason>                 GitHub or the callback refused
 *
 * The code is single-use and only redeemable with the verifier this tab
 * kept in sessionStorage when it started the flow (lib/githubFlow.ts).
 * React StrictMode runs effects twice in development; the ref makes sure
 * the exchange is attempted exactly once, since a second attempt would
 * always fail and overwrite the first attempt's result.
 */
export default function GitHubComplete() {
  useSEO({ title: 'Finishing GitHub sign-in', description: 'Completing the GitHub sign-in for Niam.' })

  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, establishSession } = useAuth()
  const startedRef = useRef(false)
  const [view, setView] = useState<View>({ kind: 'working', label: 'Finishing with GitHub…' })

  const code = params.get('code')
  const error = params.get('error')
  const urlPurpose = params.get('purpose')

  useEffect(() => {
    // Wait for the stored session to be checked: connecting needs to know
    // who is signed in, and a sign-in must not race the boot-time check.
    if (isLoading || startedRef.current) return
    startedRef.current = true

    const flow = takeGitHubFlow()

    const toLogin = (notice: NonNullable<AuthPageState['notice']>, next: string | null) =>
      navigate(withNext('/login', next), { replace: true, state: { notice } satisfies AuthPageState })

    const toRepositories = (query: string) => navigate(`/repositories?${query}`, { replace: true })

    // 1. GitHub or the callback refused before there was anything to redeem.
    if (error) {
      if (!flow) {
        const f = describeSignInFailure(error)
        setView({ kind: 'failed', title: f.title, message: f.message, links: START_AGAIN })
      } else if (flow.purpose === 'login') {
        const f = describeSignInFailure(error)
        toLogin({ title: f.title, message: f.message }, flow.returnTo)
      } else {
        toRepositories(`github=error&reason=${encodeURIComponent(error)}`)
      }
      return
    }

    // 2. Nothing pending in this tab: opened in another tab/browser, or
    //    the page was reloaded after it already finished.
    if (!flow) {
      setView({
        kind: 'failed',
        title: 'This sign-in was started somewhere else',
        message:
          'This sign-in was started in a different tab or browser, or it has already been used. For your safety it can only be finished where it began. Start again from this tab.',
        links: urlPurpose === 'connect' ? [...START_AGAIN].reverse() : START_AGAIN,
      })
      return
    }

    if (!code || (urlPurpose && urlPurpose !== flow.purpose)) {
      const reason = code ? 'browser_mismatch' : 'missing_code'
      if (flow.purpose === 'login') {
        const f = describeSignInFailure(reason)
        toLogin({ title: f.title, message: f.message }, flow.returnTo)
      } else {
        toRepositories(`github=error&reason=${reason}`)
      }
      return
    }

    // 3a. Sign in with GitHub.
    if (flow.purpose === 'login') {
      setView({ kind: 'working', label: 'Signing you in with GitHub…' })
      finishGitHubSignIn(code, flow.verifier)
        .then(async (session) => {
          await establishSession(session)
          if (session.new_account) {
            setView({ kind: 'welcome', name: session.name || session.email, to: flow.returnTo })
          } else {
            navigate(flow.returnTo, { replace: true })
          }
        })
        .catch((err: Error) => {
          const reason = err?.message ?? null
          const f = isKnownGitHubReason(reason)
            ? describeSignInFailure(reason)
            : { title: "Sign-in with GitHub didn't complete", message: reason || describeSignInFailure(null).message }
          toLogin({ title: f.title, message: f.message }, flow.returnTo)
        })
      return
    }

    // 3b. Connect GitHub to the current workspace (owners only).
    if (!isAuthenticated) {
      toLogin(
        {
          tone: 'info',
          title: 'Sign in to finish connecting GitHub',
          message:
            'Your session ended before GitHub sent you back, so nothing was connected. Sign in, then connect GitHub again from Repositories.',
        },
        '/repositories'
      )
      return
    }
    setView({ kind: 'working', label: 'Connecting GitHub…' })
    finishGitHubConnect(code, flow.verifier)
      .then(() => toRepositories('github=connected'))
      .catch((err: Error) => {
        const reason =
          httpStatus(err) === 403 ? 'not_owner' : isKnownGitHubReason(err?.message) ? err.message : 'unknown'
        toRepositories(`github=error&reason=${encodeURIComponent(reason)}`)
      })
  }, [isLoading, isAuthenticated, code, error, urlPurpose, navigate, establishSession])

  // A brand-new account: say hello, then move on without a click.
  useEffect(() => {
    if (view.kind !== 'welcome') return
    const t = window.setTimeout(() => navigate(view.to, { replace: true }), 2200)
    return () => window.clearTimeout(t)
  }, [view, navigate])

  return (
    <PublicShell eyebrow="GitHub">
      {view.kind === 'working' && (
        <div aria-live="polite">
          <h1 className="font-serif text-2xl font-medium text-text-primary mb-3">One moment</h1>
          <p className="text-xs text-text-secondary flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-text-tertiary" aria-hidden="true" />
            {view.label}
          </p>
        </div>
      )}

      {view.kind === 'welcome' && (
        <div aria-live="polite" className="space-y-4">
          <h1 className="font-serif text-2xl font-medium text-text-primary">Welcome to Niam, {view.name}</h1>
          <p className="text-xs text-text-secondary leading-relaxed">
            Your account and workspace are ready, and your GitHub repositories are already connected. Taking you to them now.
          </p>
          <Link
            to={view.to}
            replace
            className={primaryLinkClass}
          >
            Continue <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      )}

      {view.kind === 'failed' && (
        <div className="space-y-5">
          <h1 className="font-serif text-2xl font-medium text-text-primary">{view.title}</h1>
          <AuthNotice tone="error">{view.message}</AuthNotice>
          <div className="flex flex-wrap items-center gap-3">
            {view.links.map((l, i) => (
              <Link
                key={l.to}
                to={l.to}
                className={i === 0 ? primaryLinkClass : secondaryLinkClass}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </PublicShell>
  )
}
