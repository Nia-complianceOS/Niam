import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getMe } from '@/services/api/client'
import { readWorkspaceId } from '@/lib/session'
import type { WorkspaceRole } from '@/types/api'

/**
 * The signed-in user's role in the workspace this browser is acting in,
 * from GET /auth/me. null while loading (or if it could not be read).
 *
 * Only decides which review actions are shown and what the badge counts;
 * the server checks the role on every action regardless. One request is
 * shared by every component that asks, per account + workspace.
 */
let cache: { key: string; promise: Promise<WorkspaceRole | null>; value?: WorkspaceRole | null } | null =
  null

function load(key: string): Promise<WorkspaceRole | null> {
  if (cache?.key !== key) {
    const promise = getMe()
      .then((me) => {
        const value = me.role ?? null
        if (cache?.promise === promise) cache.value = value
        return value
      })
      .catch(() => {
        // A failure (or a sign-out abort) reads as "unknown"; the next
        // caller tries again rather than inheriting a cached failure.
        if (cache?.promise === promise) cache = null
        return null
      })
    cache = { key, promise }
  }
  return cache.promise
}

export function useMyRole(): WorkspaceRole | null {
  const { userId } = useAuth()
  const key = `${userId ?? ''}:${readWorkspaceId() ?? ''}`
  const [role, setRole] = useState<WorkspaceRole | null>(() =>
    cache?.key === key ? (cache.value ?? null) : null
  )

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setRole(null)
      return
    }
    load(key).then((r) => {
      if (!cancelled) setRole(r)
    })
    return () => {
      cancelled = true
    }
  }, [key, userId])

  return role
}
