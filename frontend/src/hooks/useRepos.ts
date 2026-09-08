import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getRepos, isAbortError, isNotConnectedError } from '@/services/api/client'
import type { ReposResponse } from '@/types/api'

interface UseReposResult {
  data: ReposResponse | null
  loading: boolean
  /** A real failure. Never set for the "not connected yet" case. */
  error: string | null
  /**
   * The account has no GitHub connection (or its token was revoked at
   * GitHub, which needs the same thing from the user). The backend says
   * this with a 409 rather than an empty list precisely so the UI can tell
   * "you have not connected" apart from "you have no repositories" -- they
   * look identical in a picker and have completely different fixes.
   */
  notConnected: boolean
  refetch: () => void
}

export function useRepos(enabled: boolean = true): UseReposResult {
  const { userId } = useAuth()
  const [data, setData] = useState<ReposResponse | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [notConnected, setNotConnected] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const runRef = useRef(0)

  useEffect(() => {
    const run = ++runRef.current
    // Cleared up front, not on arrival: a list fetched for one account must
    // never still be on screen while the next account's request is in
    // flight.
    setData(null)
    setError(null)
    setNotConnected(false)

    if (!enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    getRepos()
      .then((result) => {
        if (run !== runRef.current) return
        setData(result)
      })
      .catch((err: Error) => {
        if (run !== runRef.current || isAbortError(err)) return
        if (isNotConnectedError(err)) setNotConnected(true)
        else setError(err.message)
      })
      .finally(() => {
        if (run === runRef.current) setLoading(false)
      })
  }, [userId, enabled, attempt])

  const refetch = useCallback(() => setAttempt((n) => n + 1), [])

  return { data, loading, error, notConnected, refetch }
}
