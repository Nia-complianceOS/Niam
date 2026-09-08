import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  connectGitHubToken,
  disconnectGitHub,
  getGitHubConnection,
  isAbortError,
  startGitHubOAuth,
} from '@/services/api/client'
import type { GitHubConnection } from '@/types/api'

export type ConnectionPhase =
  // Asking the server who, if anyone, is connected.
  | 'checking'
  // Nobody. Show the on-ramp.
  | 'disconnected'
  // Handing off to GitHub, or exchanging a pasted token.
  | 'connecting'
  | 'connected'
  // We could not ask. Distinct from 'disconnected': inviting someone to
  // reconnect an account that is already fine is its own small betrayal.
  | 'unavailable'

interface UseGitHubConnectionResult {
  phase: ConnectionPhase
  connection: GitHubConnection | null
  /** Something went wrong doing what the user just asked for. */
  actionError: string | null
  /** We could not read the connection status at all. */
  loadError: string | null
  beginOAuth: () => Promise<void>
  submitToken: (token: string) => Promise<boolean>
  disconnect: () => Promise<void>
  refresh: () => void
}

/**
 * Who this account has connected to GitHub, and the three ways that
 * changes: the OAuth hand-off, the pasted-token fallback, and disconnect.
 *
 * Keyed on the signed-in account id like every other data hook -- a
 * connection belongs to one person, and the previous person's login and
 * avatar must not survive into the next session even for a frame.
 */
export function useGitHubConnection(): UseGitHubConnectionResult {
  const { userId } = useAuth()
  const [phase, setPhase] = useState<ConnectionPhase>('checking')
  const [connection, setConnection] = useState<GitHubConnection | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Guards against a reply from the previous account (or the previous
  // request) writing over the current one.
  const runRef = useRef(0)

  useEffect(() => {
    const run = ++runRef.current
    setPhase('checking')
    setConnection(null)
    setActionError(null)
    setLoadError(null)

    getGitHubConnection()
      .then((data) => {
        if (run !== runRef.current) return
        setConnection(data)
        setPhase(data.connected ? 'connected' : 'disconnected')
      })
      .catch((err: Error) => {
        if (run !== runRef.current || isAbortError(err)) return
        setLoadError(err.message)
        setPhase('unavailable')
      })
  }, [userId, attempt])

  const refresh = useCallback(() => setAttempt((n) => n + 1), [])

  const beginOAuth = useCallback(async () => {
    setActionError(null)
    setPhase('connecting')
    try {
      const { authorize_url } = await startGitHubOAuth()
      // A top-level navigation, not fetch(): the consent screen has to be
      // something the person sees and agrees to. The page is left behind
      // here; GitHub sends the browser back to /repositories with a
      // ?github= result that Repositories.tsx reads on mount.
      window.location.assign(authorize_url)
    } catch (err) {
      if (isAbortError(err)) return
      setActionError((err as Error).message)
      setPhase(connection?.connected ? 'connected' : 'disconnected')
    }
  }, [connection])

  const submitToken = useCallback(async (token: string) => {
    setActionError(null)
    setPhase('connecting')
    try {
      const data = await connectGitHubToken(token)
      setConnection(data)
      setPhase('connected')
      return true
    } catch (err) {
      if (isAbortError(err)) return false
      setActionError((err as Error).message)
      setPhase('disconnected')
      return false
    }
  }, [])

  const disconnect = useCallback(async () => {
    setActionError(null)
    try {
      await disconnectGitHub()
      setConnection({
        connected: false,
        login: null,
        avatar_url: null,
        scopes: [],
        method: null,
        connected_at: null,
      })
      setPhase('disconnected')
    } catch (err) {
      if (isAbortError(err)) return
      setActionError((err as Error).message)
    }
  }, [])

  return {
    phase,
    connection,
    actionError,
    loadError,
    beginOAuth,
    submitToken,
    disconnect,
    refresh,
  }
}
