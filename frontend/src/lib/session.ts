/**
 * Everything this app keeps in the browser between page loads, in one
 * place, so that signing out can provably empty it.
 *
 * The bug this exists for: logout used to remove two keys it happened to
 * remember by name, from a file that did not own the list. Anything added
 * later -- a cached user, a remembered preference -- survived a sign-out
 * and was still there when the next person signed in on the same machine.
 * A key that is not in this list is not written by this app; a key that is
 * gets cleared on the way out.
 */

export const TOKEN_KEY = 'token'
export const USER_KEY = 'niam_user'
export const SIDEBAR_KEY = 'niam_sidebar_collapsed'

const KNOWN_KEYS = [TOKEN_KEY, USER_KEY, SIDEBAR_KEY]

/**
 * Wipe every key this app owns.
 *
 * The named list is the contract; the prefix sweep is the safety net for
 * anything written by code that forgot to add itself here. Both run --
 * belt and braces is the right posture for a function whose failure mode
 * is showing one customer another customer's data.
 */
export function clearStoredSession(): void {
  try {
    for (const key of KNOWN_KEYS) localStorage.removeItem(key)

    const strays: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith('niam')) strays.push(key)
    }
    for (const key of strays) localStorage.removeItem(key)

    // sessionStorage is not used today. Clearing it costs nothing and
    // means it never becomes the next thing that outlives a sign-out.
    sessionStorage.clear()
  } catch {
    // Storage can throw in a locked-down browser (Safari private mode,
    // third-party-cookie blocking in an iframe). A sign-out must still
    // complete: the in-memory state and the token header are cleared by
    // the caller regardless.
  }
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* see clearStoredSession */
  }
}
