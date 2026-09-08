import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  abortInFlightRequests,
  getMe,
  login as apiLogin,
  signup as apiSignup,
} from '@/services/api/client'
import { clearStoredSession, readToken, writeToken } from '@/lib/session'

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
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, name: string, password: string) => Promise<void>
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
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
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
    getMe()
      .then((me) => setUser(toUser(me)))
      .catch(() => {
        clearStoredSession()
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const persist = (data: { access_token: string; user_id: string; email: string; name: string | null }) => {
    // Start from empty. Signing in without signing out first (a second
    // person on a shared machine typing a different email into the login
    // form) must not inherit a single byte from the previous session.
    abortInFlightRequests()
    clearStoredSession()
    writeToken(data.access_token)
    setUser(toUser(data))
    navigate('/')
  }

  const login = async (email: string, password: string) => {
    // Errors propagate deliberately. The pages catch them and show the
    // message; swallowing them here is what made a wrong password look
    // like a dead button.
    persist(await apiLogin(email, password))
  }

  const signup = async (email: string, name: string, password: string) => {
    persist(await apiSignup(email, password, name))
  }

  const logout = useCallback(() => {
    abortInFlightRequests()
    clearStoredSession()
    setUser(null)
    navigate('/login')
  }, [navigate])

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.id ?? null,
        login,
        signup,
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
