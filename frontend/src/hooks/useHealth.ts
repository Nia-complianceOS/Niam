import { useEffect, useState } from 'react'
import { getHealth, isAbortError } from '@/services/api/client'

export interface HealthResponse {
  status: string
  environment: string
  neo4j_connected: boolean
  supabase_connected?: boolean
}

export type BackendState =
  | { kind: 'checking' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'degraded'; health: HealthResponse; problems: string[] }
  | { kind: 'unreachable'; message: string }

const POLL_MS = 60_000

/**
 * What GET /health actually says, for the status dot in the app footer.
 * It used to be a hard-coded green "Audit Engine Active" that stayed green
 * with the backend switched off.
 */
export function useBackendStatus(): BackendState {
  const [state, setState] = useState<BackendState>({ kind: 'checking' })

  useEffect(() => {
    let cancelled = false

    const check = () => {
      getHealth()
        .then((health: HealthResponse) => {
          if (cancelled) return
          const problems: string[] = []
          if (health.status !== 'ok') problems.push('API reports a problem')
          if (!health.neo4j_connected) problems.push('graph database unreachable')
          if (health.supabase_connected === false) problems.push('account database unreachable')
          setState(problems.length ? { kind: 'degraded', health, problems } : { kind: 'ok', health })
        })
        .catch((err: Error) => {
          if (cancelled || isAbortError(err)) return
          setState({ kind: 'unreachable', message: err.message })
        })
    }

    check()
    const timer = setInterval(check, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return state
}
