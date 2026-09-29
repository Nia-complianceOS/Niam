import { useLocation, useSearchParams } from 'react-router-dom'

/**
 * Where to send someone after they sign in, taken from `?next=` or from
 * the location ProtectedRoute bounced them from.
 *
 * Only a path on THIS origin is accepted. `next` is attacker-controlled
 * (anyone can send a link to /login?next=…), so an absolute URL,
 * a protocol-relative `//evil.example`, or a backslash trick that some
 * browsers normalise to `//` would turn the login page into an open
 * redirect. Anything that is not plainly a same-origin path is dropped.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return null
    const path = `${url.pathname}${url.search}${url.hash}`
    // Sending a signed-in person back to a sign-in page is a loop.
    if (/^\/(login|signup)(\/|$|\?)/.test(url.pathname)) return null
    return path
  } catch {
    return null
  }
}

/** `/login?next=<path>` (or /signup), preserving a safe destination. */
export function withNext(base: '/login' | '/signup', next: string | null): string {
  const safe = safeNextPath(next)
  return safe ? `${base}?next=${encodeURIComponent(safe)}` : base
}

/**
 * A message handed over by another page: GitHubComplete sends failed
 * GitHub sign-ins here with the explanation in router state.
 */
export interface AuthPageState {
  from?: { pathname?: string; search?: string }
  notice?: { title: string; message: string; tone?: 'error' | 'info' | 'success' }
}

/** `?next=` first, then wherever ProtectedRoute bounced the visitor from. */
export function useNextPath(): string | null {
  const [params] = useSearchParams()
  const location = useLocation()
  const state = (location.state ?? null) as AuthPageState | null
  const fromState = state?.from?.pathname ? `${state.from.pathname}${state.from.search ?? ''}` : null
  return safeNextPath(params.get('next')) ?? safeNextPath(fromState)
}
