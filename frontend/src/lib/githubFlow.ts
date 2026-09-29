/**
 * The browser half of the GitHub OAuth flow (connect GitHub, and sign in
 * with GitHub).
 *
 * Before sending the user to GitHub, this browser makes a random
 * verifier, keeps it in sessionStorage, and sends only its SHA-256 to the
 * backend. When GitHub sends the browser back to /auth/github/complete,
 * the page POSTs the one-time code together with the verifier. The server
 * accepts it only if the hashes match -- so the flow can only be finished
 * in the browser that started it. (Sending someone your connect link, or
 * signing a victim into your account, both fail at this check.)
 *
 * sessionStorage, not localStorage: it is per tab and dies with the tab,
 * and nothing about this flow should outlive it.
 */

export type GitHubFlowPurpose = 'login' | 'connect'

const VERIFIER_KEY = 'niam_gh_verifier'
const PURPOSE_KEY = 'niam_gh_purpose'
const RETURN_KEY = 'niam_gh_return'

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomVerifier(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes.buffer)
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return toHex(digest)
}

/**
 * Start a flow: returns the binding (hash) to send to the start endpoint.
 * `returnTo` is where to land afterwards (e.g. '/repositories').
 */
export async function beginGitHubFlow(
  purpose: GitHubFlowPurpose,
  returnTo: string
): Promise<string> {
  const verifier = randomVerifier()
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier)
    sessionStorage.setItem(PURPOSE_KEY, purpose)
    sessionStorage.setItem(RETURN_KEY, returnTo)
  } catch {
    throw new Error('This browser blocked session storage, which GitHub sign-in needs.')
  }
  return sha256Hex(verifier)
}

/** Read and forget the pending flow. null if this tab did not start one. */
export function takeGitHubFlow(): {
  verifier: string
  purpose: GitHubFlowPurpose
  returnTo: string
} | null {
  try {
    const verifier = sessionStorage.getItem(VERIFIER_KEY)
    const purpose = sessionStorage.getItem(PURPOSE_KEY) as GitHubFlowPurpose | null
    const returnTo = sessionStorage.getItem(RETURN_KEY) || '/dashboard'
    sessionStorage.removeItem(VERIFIER_KEY)
    sessionStorage.removeItem(PURPOSE_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    if (!verifier || !purpose) return null
    return { verifier, purpose, returnTo }
  } catch {
    return null
  }
}

/** The pending flow's purpose without consuming it (for error routing). */
export function peekGitHubFlowPurpose(): GitHubFlowPurpose | null {
  try {
    return sessionStorage.getItem(PURPOSE_KEY) as GitHubFlowPurpose | null
  } catch {
    return null
  }
}
