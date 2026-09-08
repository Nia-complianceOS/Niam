import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { isAbortError } from '@/services/api/client'

interface UseAsyncResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Fetch-on-mount hook shared by every page-level hook (useRepos, useVendors,
 * etc.). Re-fetches whenever `deps` changes. Cancels state updates if the
 * component unmounts mid-request.
 *
 * TWO THINGS HERE ARE ABOUT TENANCY, not about convenience:
 *
 * 1. The signed-in account id is always part of the dependency list. A
 *    change of user re-runs the fetch; it can never keep serving what was
 *    fetched for somebody else.
 *
 * 2. `data` and `error` are cleared at the START of every run. They used
 *    to be left in place while `loading` was true, which meant a re-run
 *    rendered the previous result underneath a loading flag -- fine when
 *    the only re-run was a refresh, a disclosure once the previous result
 *    belonged to a different account.
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []): UseAsyncResult<T> {
  const { userId } = useAuth()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Kept in a ref so a caller passing an inline arrow function (all of
  // them do) does not restart the request on every render.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let cancelled = false
    setData(null)
    setLoading(true)
    setError(null)

    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: Error) => {
        // A request cancelled by sign-out is not something to report.
        if (!cancelled && !isAbortError(err)) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, attempt, ...deps])

  const refetch = useCallback(() => setAttempt((n) => n + 1), [])

  return { data, loading, error, refetch }
}
