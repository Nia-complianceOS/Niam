import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  abortInFlightRequests,
  getMe,
  httpStatus,
  isAbortError,
  login as apiLogin,
  signup as apiSignup,
  type MeResponse,
  type TokenResponse,
} from '@/services/api/client'
import {
  clearStoredSession,
  readToken,
  readWorkspaceId,
  writeToken,
  writeWorkspaceId,
} from '@/lib/session'
import { safeNextPath } from '@/lib/redirect'
import type { WorkspaceInfo, WorkspaceRole } from '@/types/api'

interface User {
  id: string
  name: string
  email: string
}

interface AuthContextType {
  user: User | null
  /**
   * The signed-in account's id, or null. Every data-fetching hook keys its
   * state on this so a response fetched for one account can never be shown
   * under another -- see the note on logout() below.
   */
  userId: string | null
  /** Role in the workspace this browser is acting in (null until known). */
  role: WorkspaceRole | null
  /** The workspace every request acts in (the server's answer, not ours). */
  workspaceId: string | null
  /** Every workspace this account belongs to, personal first. */
  workspaces: WorkspaceInfo[]
  /** False for an account created with GitHub that has no password yet. */
  hasPassword: boolean
  /** GitHub login linked for sign-in, if any. */
  githubLogin: string | null
  /**
   * `next` is where to land afterwards; anything that is not a same-origin
   * path is ignored and the dashboard is used.
   */
  login: (email: string, password: string, next?: string | null) => Promise<void>
  signup: (email: string, name: string, password: string, next?: string | null) => Promise<void>
  /**
   * Store a session the server has just issued (password or GitHub
   * sign-in) and load the account. Does not navigate.
   */
  establishSession: (data: TokenResponse) => Promise<void>
  /** Re-read /auth/me (after a password is set, GitHub is unlinked…). */
  refreshAccount: () => Promise<void>
  /**
   * Act in another workspace. Reloads the app so nothing fetched for the
   * previous workspace can flash on screen for the next one.
   */
  switchWorkspace: (workspaceId: string) => void
  logout: () => void
  isAuthenticated: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Real authentication against POST /auth/login and /auth/signup.
 *
 * This file was the other half of the auth bypass. login() wrote the
 * literal string 'mock-token-123' into localStorage and invented a user
 * called "Admin Workspace" -- it never contacted the API, and the password
 * the form collected was discarded. The backend accepted that token, so
 * every protected route was open to anyone who knew the string.
 *
 * The endpoints it should have been calling existed the whole time.
 *
 * SIGNING OUT MUST LEAVE NOTHING BEHIND. Now that the backend is
 * multi-tenant, two people can use one browser and each one's data is
 * private to them, so "mostly cleared" is a disclosure. Three things are
 * cleared here, in this order:
 *
 *   1. every request already on the wire, so a reply authorised by the
 *      outgoing user cannot be handed to a component rendered for the
 *      incoming one;
 *   2. every key this app writes to browser storage (lib/session.ts owns
 *      that list, so it cannot drift out of date here again);
 *   3. the in-memory user, which drops `userId` to null -- and because the
 *      authenticated tree is keyed on it (ProtectedRoute) and every page
 *      hook has it in its dependency list, all cached page state is thrown
 *      away with it rather than being reused for the next account.
 */
interface Account {
  role: WorkspaceRole | null
  workspaceId: string | null
  workspaces: WorkspaceInfo[]
  hasPassword: boolean
  githubLogin: string | null
}

const NO_ACCOUNT: Account = {
  role: null,
  workspaceId: null,
  workspaces: [],
  hasPassword: true,
  githubLogin: null,
}

const toAccount = (me: MeResponse): Account => ({
  role: me.role,
  workspaceId: me.workspace_id,
  workspaces: me.workspaces ?? [],
  hasPassword: me.has_password !== false,
  githubLogin: me.github_login ?? null,
})

/**
 * 403 on /auth/me with a workspace id stored means this browser is asking
 * to act in a workspace the account was removed from (or that was
 * deleted). The server answers the same for both, on purpose.
 */
function isStaleWorkspaceError(err: unknown): boolean {
  return httpStatus(err) === 403 && !!readWorkspaceId()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [account, setAccount] = useState<Account>(NO_ACCOUNT)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  // A display name is optional on the account, so fall back to the local
  // part of the email rather than inventing one.
  const toUser = (u: { user_id: string; email: string; name: string | null }): User => ({
    id: u.user_id,
    email: u.email,
    name: u.name || u.email.split('@')[0],
  })

  useEffect(() => {
    const token = readToken()
    if (!token) {
      setIsLoading(false)
      return
    }
    // Ask the server who this token belongs to instead of trusting the
    // cached user object. An expired token, a rotated JWT_SECRET or a
    // deleted account all fail here -- which is better than rendering a
    // signed-in shell whose every request then 401s.
    // Removed from the workspace this browser was acting in: forget it
    // and ask again as the personal workspace, once. Nothing else has
    // mounted yet (ProtectedRoute waits on isLoading), so no reload is
    // needed to keep stale data off screen.
    const loadMe = () =>
      getMe().catch((err) => {
        if (!isStaleWorkspaceError(err)) throw err
        writeWorkspaceId(null)
        return getMe()
      })

    loadMe()
      .then((me) => {
        setUser(toUser(me))
        setAccount(toAccount(me))
      })
      .catch((err) => {
        // Cancelled because a new session is being established (a sign-in
        // finished while this was in flight): that session owns storage
        // now, so clearing it here would sign the new person straight out.
        if (isAbortError(err)) return
        clearStoredSession()
        setUser(null)
        setAccount(NO_ACCOUNT)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const establishSession = useCallback(async (data: TokenResponse) => {
    // Start from empty. Signing in without signing out first (a second
    // person on a shared machine typing a different email into the login
    // form) must not inherit a single byte from the previous session.
    abortInFlightRequests()
    clearStoredSession()
    writeToken(data.access_token)
    // Role and workspaces come from /auth/me. The token response is
    // enough to be signed in, so a failure here is not fatal: the pages
    // still work, and role-gated controls stay hidden until known.
    let nextAccount = NO_ACCOUNT
    try {
      nextAccount = toAccount(await getMe())
    } catch {
      /* keep NO_ACCOUNT */
    }
    setAccount(nextAccount)
    setUser(toUser(data))
  }, [])

  const refreshAccount = useCallback(async () => {
    const me = await getMe()
    setUser(toUser(me))
    setAccount(toAccount(me))
  }, [])

  const login = async (email: string, password: string, next?: string | null) => {
    // Errors propagate deliberately. The pages catch them and show the
    // message; swallowing them here is what made a wrong password look
    // like a dead button.
    await establishSession(await apiLogin(email, password))
    navigate(safeNextPath(next) ?? '/dashboard')
  }

  const signup = async (email: string, name: string, password: string, next?: string | null) => {
    await establishSession(await apiSignup(email, password, name))
    navigate(safeNextPath(next) ?? '/dashboard')
  }

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      // The personal workspace's id is the user's id; storing nothing
      // means "my own workspace" and survives that id never being sent.
      const personal =
        workspaceId === user?.id ||
        account.workspaces.some((w) => w.workspace_id === workspaceId && w.personal)
      abortInFlightRequests()
      writeWorkspaceId(personal ? null : workspaceId)
      window.location.assign('/dashboard')
    },
    [user, account.workspaces]
  )

  const logout = useCallback(() => {
    abortInFlightRequests()
    clearStoredSession()
    setUser(null)
    setAccount(NO_ACCOUNT)
    navigate('/login')
  }, [navigate])

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.id ?? null,
        role: user ? account.role : null,
        workspaceId: user ? account.workspaceId : null,
        workspaces: user ? account.workspaces : [],
        hasPassword: account.hasPassword,
        githubLogin: user ? account.githubLogin : null,
        login,
        signup,
        establishSession,
        refreshAccount,
        switchWorkspace,
        logout,
        isAuthenticated: !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
